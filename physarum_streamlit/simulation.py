"""Agent-based Physarum polycephalum simulation.

The simulator stores agents in NumPy arrays and fields on a regular grid.
Coordinates use the convention x = column and y = row; all fields have shape
(H, W). The implementation follows the equations documented in docs/model.tex.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import json
from typing import Any

import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter

from network_solver import NetworkParams, PhysarumNetworkSolver


EPS = 1.0e-9
MODE_SEARCH = 0
MODE_EXPLOIT = 1
MODE_DORMANT = 2
MODE_NAMES = {
    MODE_SEARCH: "search",
    MODE_EXPLOIT: "exploit",
    MODE_DORMANT: "dormant",
}


@dataclass
class FoodSource:
    """A point food source with remaining abstract calories."""

    x: float
    y: float
    calories: float
    initial_calories: float | None = None
    quality: float = 1.0
    sigma: float = 10.0
    radius: float = 3.0

    def __post_init__(self) -> None:
        if self.initial_calories is None:
            self.initial_calories = max(0.0, float(self.calories))
        else:
            self.initial_calories = max(EPS, float(self.initial_calories))


@dataclass
class SimParams:
    """All user-facing simulation parameters."""

    # World
    W: int = 120
    H: int = 80
    boundary_mode: str = "bounce"
    random_seed: int = 42
    dt: float = 1.0

    # Agents
    initial_agents: int = 800
    max_agents: int = 3000
    agent_init_mode: str = "edge_patch"
    patch_center_x: float = 14.0
    patch_center_y: float = 14.0
    patch_sigma: float = 3.0
    initial_energy: float = 50.0
    E_max: float = 100.0
    initial_mass: float = 1.0
    death_policy: str = "remove"
    death_energy: float = 1.0

    # Movement and sensing
    move_distance: float = 1.0
    min_speed: float = 0.2
    sensor_distance: float = 5.0
    sensor_angle: float = 0.7
    rotation_angle: float = 0.35
    random_turn_sigma: float = 0.5
    w_trail: float = 1.0
    w_food: float = 2.5
    w_obstacle: float = 1000.0
    w_repellent: float = 1.0
    v_exploit: float = 0.8

    # Trail
    trail_deposit_base: float = 1.0
    trail_decay: float = 0.04
    trail_diffusion: float = 0.8
    trail_cost: float = 0.005
    rho_exploit_deposit: float = 1.2
    trail_coverage_threshold: float = 0.05

    # Food
    initial_food_count: int = 5
    default_food_calories: float = 500.0
    default_food_radius: float = 3.0
    eat_radius: float = 2.5
    bite_rate: float = 2.0
    food_efficiency: float = 0.8
    sigma_food: float = 10.0
    C_half: float = 200.0
    food_min_calories: float = 1.0e-6

    # Energy
    c_base: float = 0.03
    c_move: float = 0.05
    c_dormant: float = 0.005
    c_growth: float = 1.0

    # Growth and division
    growth_rate: float = 0.02
    growth_threshold: float = 0.65
    split_energy: float = 85.0
    split_position_sigma: float = 1.0

    # Search/exploit
    k_E: float = 8.0
    theta_E: float = 0.25
    k_S: float = 5.0
    search_threshold: float = 0.15
    theta_dormant: float = 0.08
    keep_searching_without_food: bool = True

    # Network
    enable_network: bool = True
    network_update_every: int = 5
    graph_k_neighbors: int = 4
    include_trail_landmarks: bool = True
    max_trail_landmarks: int = 20
    dense_graph_support_nodes: int = 0
    I0: float = 2.0
    alpha_D: float = 1.0
    mu_D: float = 0.08
    gamma: float = 1.4
    q0_flow: float = 1.0
    D_min: float = 1.0e-4
    D_init: float = 0.05
    path_eta: float = 1.0
    rho_network: float = 0.1
    D_vis: float = 0.02
    network_edge_sigma: float = 1.5
    obstacle_check_edges: bool = True

    # Visualization
    show_agents: bool = True
    show_food: bool = True
    show_trail_heatmap: bool = True
    show_network_overlay: bool = True
    show_shortest_path_overlay: bool = True
    show_obstacles: bool = True
    show_colorbar: bool = True
    figure_size: float = 8.0
    agent_marker_size: float = 6.0


def wrap_angle(theta: np.ndarray | float) -> np.ndarray | float:
    """Wrap angles to (-pi, pi]."""

    return (theta + np.pi) % (2.0 * np.pi) - np.pi


def sigmoid(x: np.ndarray) -> np.ndarray:
    """Numerically stable logistic sigmoid."""

    x = np.clip(x, -60.0, 60.0)
    return 1.0 / (1.0 + np.exp(-x))


def bilinear_sample(
    field: np.ndarray,
    points: np.ndarray,
    boundary_mode: str,
    outside_value: float = 0.0,
) -> np.ndarray:
    """Sample a grid field at continuous x,y points using bilinear interpolation."""

    if points.size == 0:
        return np.zeros(0, dtype=float)

    h, w = field.shape
    x = points[:, 0].astype(float)
    y = points[:, 1].astype(float)

    if boundary_mode == "wrap":
        x = np.mod(x, w)
        y = np.mod(y, h)
        valid = np.ones(points.shape[0], dtype=bool)
    else:
        valid = (x >= 0.0) & (x <= w - 1.0) & (y >= 0.0) & (y <= h - 1.0)
        x = np.clip(x, 0.0, w - 1.0)
        y = np.clip(y, 0.0, h - 1.0)

    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    x1 = (x0 + 1) % w if boundary_mode == "wrap" else np.clip(x0 + 1, 0, w - 1)
    y1 = (y0 + 1) % h if boundary_mode == "wrap" else np.clip(y0 + 1, 0, h - 1)
    dx = x - x0
    dy = y - y0

    v00 = field[y0, x0]
    v10 = field[y0, x1]
    v01 = field[y1, x0]
    v11 = field[y1, x1]
    values = (
        (1.0 - dx) * (1.0 - dy) * v00
        + dx * (1.0 - dy) * v10
        + (1.0 - dx) * dy * v01
        + dx * dy * v11
    )
    values[~valid] = outside_value
    return values


def bilinear_splat(
    shape: tuple[int, int],
    points: np.ndarray,
    amounts: np.ndarray,
    boundary_mode: str = "bounce",
) -> np.ndarray:
    """Deposit point amounts onto four neighboring grid cells."""

    field = np.zeros(shape, dtype=float)
    if points.size == 0 or amounts.size == 0:
        return field

    h, w = shape
    x = points[:, 0].astype(float)
    y = points[:, 1].astype(float)
    if boundary_mode == "wrap":
        x = np.mod(x, w)
        y = np.mod(y, h)
        valid = np.ones(points.shape[0], dtype=bool)
    else:
        valid = (x >= 0.0) & (x <= w - 1.0) & (y >= 0.0) & (y <= h - 1.0)
        x = np.clip(x, 0.0, w - 1.0)
        y = np.clip(y, 0.0, h - 1.0)

    if not np.any(valid):
        return field

    x = x[valid]
    y = y[valid]
    amounts = amounts[valid]
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    x1 = (x0 + 1) % w if boundary_mode == "wrap" else np.clip(x0 + 1, 0, w - 1)
    y1 = (y0 + 1) % h if boundary_mode == "wrap" else np.clip(y0 + 1, 0, h - 1)
    dx = x - x0
    dy = y - y0

    contributions = (
        (x0, y0, (1.0 - dx) * (1.0 - dy)),
        (x1, y0, dx * (1.0 - dy)),
        (x0, y1, (1.0 - dx) * dy),
        (x1, y1, dx * dy),
    )
    for xs, ys, weights in contributions:
        np.add.at(field, (ys, xs), amounts * weights)
    return field


class PhysarumSimulation:
    """Stateful Physarum simulator."""

    def __init__(self, params: SimParams):
        self.params = params
        self.rng = np.random.default_rng(params.random_seed)
        self.network_solver: PhysarumNetworkSolver | None = None
        self.previous_colony_center = np.array([params.W / 2.0, params.H / 2.0], dtype=float)
        self.reset()

    def reset(self) -> None:
        """Reset fields, food, agents, and optional network state."""

        p = self.params
        self.rng = np.random.default_rng(p.random_seed)
        self.step_count = 0
        self.trail = np.zeros((p.H, p.W), dtype=float)
        self.prev_trail = self.trail.copy()
        self.food_field = np.zeros_like(self.trail)
        self.repellent = np.zeros_like(self.trail)
        self.obstacle_mask = np.zeros((p.H, p.W), dtype=bool)
        self.food_sources: list[FoodSource] = []
        self.initial_food_total = 0.0

        n = max(0, min(int(p.initial_agents), int(p.max_agents)))
        for _ in range(max(0, int(p.initial_food_count))):
            margin_x = max(3.0, p.W * 0.08)
            margin_y = max(3.0, p.H * 0.08)
            x = self.rng.uniform(margin_x, max(margin_x + EPS, p.W - margin_x))
            y = self.rng.uniform(margin_y, max(margin_y + EPS, p.H - margin_y))
            self.add_food(x, y, p.default_food_calories, 1.0, p.sigma_food, p.default_food_radius)

        self.initial_food_total = self.total_food_calories()
        self._initialize_agents(n)
        self.previous_colony_center = np.array([p.W / 2.0, p.H / 2.0], dtype=float)
        self.network_solver = PhysarumNetworkSolver(self._network_params()) if p.enable_network else None

    def _network_params(self) -> NetworkParams:
        p = self.params
        return NetworkParams(
            k_neighbors=p.graph_k_neighbors,
            include_trail_landmarks=p.include_trail_landmarks,
            max_trail_landmarks=p.max_trail_landmarks,
            dense_graph_support_nodes=p.dense_graph_support_nodes,
            I0=p.I0,
            alpha_D=p.alpha_D,
            mu_D=p.mu_D,
            gamma=p.gamma,
            q0_flow=p.q0_flow,
            D_min=p.D_min,
            D_init=p.D_init,
            path_eta=p.path_eta,
            rho_network=p.rho_network,
            D_vis=p.D_vis,
            edge_sigma=p.network_edge_sigma,
            obstacle_check_edges=p.obstacle_check_edges,
            dt=p.dt,
        )

    def _sync_network(self) -> None:
        if not self.params.enable_network:
            self.network_solver = None
            return
        if self.network_solver is None:
            self.network_solver = PhysarumNetworkSolver(self._network_params())
        else:
            self.network_solver.params = self._network_params()

    def _initialize_agents(self, count: int) -> None:
        """Create the initial agent array using the configured placement mode."""

        count = int(max(0, min(count, self.params.max_agents)))
        if count <= 0:
            self.positions = np.zeros((0, 2), dtype=float)
            self.headings = np.zeros(0, dtype=float)
            self.energies = np.zeros(0, dtype=float)
            self.masses = np.zeros(0, dtype=float)
            self.alive = np.zeros(0, dtype=bool)
            self.modes = np.zeros(0, dtype=np.int8)
            return

        positions = self._sample_agent_positions(count, self.params.agent_init_mode)
        self.positions = positions
        self.headings = self.rng.uniform(-np.pi, np.pi, size=count)
        self.energies = np.full(count, min(self.params.initial_energy, self.params.E_max), dtype=float)
        self.masses = np.full(count, self.params.initial_mass, dtype=float)
        self.alive = np.ones(count, dtype=bool)
        self.modes = np.full(count, MODE_SEARCH, dtype=np.int8)

    def reset_agents_patch(
        self,
        x: float,
        y: float,
        *,
        count: int | None = None,
        sigma: float | None = None,
        energy: float | None = None,
        mass: float | None = None,
    ) -> None:
        """Replace all agents with one compact biological patch."""

        n = self.params.initial_agents if count is None else count
        n = int(max(0, min(n, self.params.max_agents)))
        if n <= 0:
            self._initialize_agents(0)
            return
        positions = self._sample_patch_positions(
            n,
            np.array([float(x), float(y)], dtype=float),
            self.params.patch_sigma if sigma is None else float(sigma),
        )
        self.positions = positions
        self.headings = self.rng.uniform(-np.pi, np.pi, size=n)
        self.energies = np.full(n, min(self.params.initial_energy if energy is None else energy, self.params.E_max), dtype=float)
        self.masses = np.full(n, max(EPS, self.params.initial_mass if mass is None else mass), dtype=float)
        self.alive = np.ones(n, dtype=bool)
        self.modes = np.full(n, MODE_SEARCH, dtype=np.int8)
        self.previous_colony_center = np.array([float(x), float(y)], dtype=float)

    def _sample_agent_positions(self, count: int, mode: str) -> np.ndarray:
        p = self.params
        if mode == "random":
            return self._sample_random_open_positions(count)
        if mode == "central_patch":
            center = np.array([p.W * 0.5, p.H * 0.5], dtype=float)
        elif mode == "edge_patch":
            center = np.array([p.W * 0.14, p.H * 0.16], dtype=float)
        elif mode == "around_food" and self.food_sources:
            food = max(self.food_sources, key=lambda item: float(item.calories))
            center = np.array([food.x, food.y], dtype=float)
        else:
            center = np.array([p.patch_center_x, p.patch_center_y], dtype=float)
        return self._sample_patch_positions(count, center, p.patch_sigma)

    def _sample_patch_positions(self, count: int, center: np.ndarray, sigma: float) -> np.ndarray:
        count = int(max(0, count))
        if count <= 0:
            return np.zeros((0, 2), dtype=float)

        sigma = max(0.1, float(sigma))
        center = np.array(
            [
                np.clip(float(center[0]), 0.0, self.params.W - EPS),
                np.clip(float(center[1]), 0.0, self.params.H - EPS),
            ],
            dtype=float,
        )
        accepted: list[np.ndarray] = []
        remaining = count
        for _ in range(12):
            batch = max(remaining * 3, 32)
            candidates = center + self.rng.normal(0.0, sigma, size=(batch, 2))
            candidates = self._apply_position_bounds(candidates)
            candidates = candidates[self._open_position_mask(candidates)]
            if candidates.size:
                take = min(remaining, len(candidates))
                accepted.append(candidates[:take])
                remaining -= take
            if remaining <= 0:
                break

        if remaining > 0:
            accepted.append(self._sample_random_open_positions(remaining))
        return np.vstack(accepted)[:count] if accepted else self._sample_random_open_positions(count)

    def _sample_random_open_positions(self, count: int) -> np.ndarray:
        count = int(max(0, count))
        if count <= 0:
            return np.zeros((0, 2), dtype=float)
        accepted: list[np.ndarray] = []
        remaining = count
        for _ in range(20):
            batch = max(remaining * 3, 64)
            candidates = np.column_stack(
                [
                    self.rng.uniform(0.0, self.params.W - EPS, size=batch),
                    self.rng.uniform(0.0, self.params.H - EPS, size=batch),
                ]
            )
            candidates = candidates[self._open_position_mask(candidates)]
            if candidates.size:
                take = min(remaining, len(candidates))
                accepted.append(candidates[:take])
                remaining -= take
            if remaining <= 0:
                break

        if remaining > 0:
            fallback = np.column_stack(
                [
                    self.rng.uniform(0.0, self.params.W - EPS, size=remaining),
                    self.rng.uniform(0.0, self.params.H - EPS, size=remaining),
                ]
            )
            accepted.append(fallback)
        return np.vstack(accepted)[:count]

    def _open_position_mask(self, positions: np.ndarray) -> np.ndarray:
        if positions.size == 0:
            return np.zeros(0, dtype=bool)
        in_bounds = (
            (positions[:, 0] >= 0.0)
            & (positions[:, 0] < self.params.W)
            & (positions[:, 1] >= 0.0)
            & (positions[:, 1] < self.params.H)
        )
        if not np.any(self.obstacle_mask):
            return in_bounds
        x = np.clip(np.floor(positions[:, 0]).astype(int), 0, self.params.W - 1)
        y = np.clip(np.floor(positions[:, 1]).astype(int), 0, self.params.H - 1)
        return in_bounds & ~self.obstacle_mask[y, x]

    def set_obstacle_mask(self, mask: np.ndarray) -> None:
        """Replace obstacles and move any trapped agents back to open cells."""

        clean = np.asarray(mask, dtype=bool)
        if clean.shape != self.trail.shape:
            raise ValueError(f"obstacle mask shape {clean.shape} does not match simulation shape {self.trail.shape}")
        self.obstacle_mask = clean.copy()
        self.trail[self.obstacle_mask] = 0.0
        self.prev_trail[self.obstacle_mask] = 0.0
        if len(self.positions):
            trapped = self._positions_in_obstacles(self.positions)
            if np.any(trapped):
                self.positions[trapped] = self._sample_random_open_positions(int(np.sum(trapped)))
        self.compute_food_field()

    def step(self, n_steps: int = 1) -> list[dict[str, float]]:
        """Advance the simulation and return one metric row per completed step."""

        rows: list[dict[str, float]] = []
        for _ in range(max(0, int(n_steps))):
            self._single_step()
            rows.append(self.get_metrics())
        return rows

    def _single_step(self) -> None:
        p = self.params
        self.compute_food_field()
        movement_distances, trail_amounts, deposit_positions = self.update_agents()
        self.update_trail(deposit_positions, trail_amounts)
        food_gains = self.update_food_consumption()
        self.update_energy_growth_division(food_gains, movement_distances, trail_amounts)
        self._maybe_update_network()
        self.step_count += 1

    def add_agents(self, x: float, y: float, count: int, energy: float, mass: float) -> None:
        """Add agents near a coordinate."""

        count = int(max(0, min(count, self.params.max_agents - len(self.positions))))
        if count <= 0:
            return
        new_positions = self._sample_patch_positions(count, np.array([x, y], dtype=float), sigma=0.75)
        new_headings = self.rng.uniform(-np.pi, np.pi, size=count)
        new_energies = np.full(count, np.clip(energy, 0.0, self.params.E_max), dtype=float)
        new_masses = np.full(count, max(mass, EPS), dtype=float)
        new_alive = np.ones(count, dtype=bool)
        new_modes = np.full(count, MODE_SEARCH, dtype=np.int8)
        self._append_agents(new_positions, new_headings, new_energies, new_masses, new_alive, new_modes)

    def add_food(
        self,
        x: float,
        y: float,
        calories: float,
        quality: float,
        sigma: float,
        radius: float | None = None,
    ) -> None:
        """Add a food source."""

        x = float(np.clip(x, 0.0, self.params.W - EPS))
        y = float(np.clip(y, 0.0, self.params.H - EPS))
        radius_value = self.params.default_food_radius if radius is None else radius
        self.food_sources.append(
            FoodSource(
                x=x,
                y=y,
                calories=max(0.0, float(calories)),
                initial_calories=max(EPS, float(calories)),
                quality=max(EPS, float(quality)),
                sigma=max(EPS, float(sigma)),
                radius=max(0.1, float(radius_value)),
            )
        )
        self.initial_food_total = max(self.initial_food_total, self.total_food_calories())

    def update_food(
        self,
        index: int,
        *,
        calories: float | None = None,
        quality: float | None = None,
        sigma: float | None = None,
        radius: float | None = None,
    ) -> bool:
        """Update an existing food source in place."""

        if index < 0 or index >= len(self.food_sources):
            return False
        food = self.food_sources[index]
        if calories is not None:
            food.calories = max(0.0, float(calories))
            food.initial_calories = max(float(getattr(food, "initial_calories", food.calories)), food.calories, EPS)
        if quality is not None:
            food.quality = max(EPS, float(quality))
        if sigma is not None:
            food.sigma = max(EPS, float(sigma))
        if radius is not None:
            food.radius = max(0.1, float(radius))
        self.initial_food_total = max(self.initial_food_total, self.total_food_calories())
        return True

    def remove_food_near(self, x: float, y: float, radius: float) -> bool:
        """Remove the closest food source within radius."""

        if not self.food_sources:
            return False
        xy = np.array([[f.x, f.y] for f in self.food_sources], dtype=float)
        distances = np.linalg.norm(xy - np.array([x, y]), axis=1)
        idx = int(np.argmin(distances))
        if distances[idx] <= radius:
            del self.food_sources[idx]
            return True
        return False

    def add_obstacle_rect(self, x0: float, y0: float, x1: float, y1: float) -> None:
        """Mark a rectangular obstacle region."""

        xs, ys = self._rect_slices(x0, y0, x1, y1)
        self.obstacle_mask[ys, xs] = True

    def erase_obstacle_rect(self, x0: float, y0: float, x1: float, y1: float) -> None:
        """Erase a rectangular obstacle region."""

        xs, ys = self._rect_slices(x0, y0, x1, y1)
        self.obstacle_mask[ys, xs] = False

    def _rect_slices(self, x0: float, y0: float, x1: float, y1: float) -> tuple[slice, slice]:
        xa, xb = sorted((int(np.floor(x0)), int(np.ceil(x1))))
        ya, yb = sorted((int(np.floor(y0)), int(np.ceil(y1))))
        xa = int(np.clip(xa, 0, self.params.W - 1))
        xb = int(np.clip(xb, xa + 1, self.params.W))
        ya = int(np.clip(ya, 0, self.params.H - 1))
        yb = int(np.clip(yb, ya + 1, self.params.H))
        return slice(xa, xb), slice(ya, yb)

    def compute_food_field(self) -> np.ndarray:
        """Recompute the saturating Gaussian food attractant field."""

        p = self.params
        field = np.zeros((p.H, p.W), dtype=float)
        active = [f for f in self.food_sources if f.calories > p.food_min_calories]
        if not active:
            self.food_field = field
            return field

        yy, xx = np.mgrid[0 : p.H, 0 : p.W]
        for food in active:
            h_c = food.calories / (food.calories + p.C_half + EPS)
            dist2 = (xx - food.x) ** 2 + (yy - food.y) ** 2
            field += food.quality * h_c * np.exp(-dist2 / (2.0 * food.sigma**2))
        self.food_field = field
        return field

    def active_food_count(self) -> int:
        """Return the number of food sources with calories remaining."""

        return sum(food.calories > self.params.food_min_calories for food in self.food_sources)

    def compute_sensory_field(self) -> np.ndarray:
        """Combine trail, food, obstacle, and repellent fields."""

        p = self.params
        return (
            p.w_trail * self.trail
            + p.w_food * self.food_field
            - p.w_obstacle * self.obstacle_mask.astype(float)
            - p.w_repellent * self.repellent
        )

    def update_agents(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Update modes, headings, and positions for all agents."""

        p = self.params
        n = len(self.positions)
        movement_distances = np.zeros(n, dtype=float)
        trail_amounts = np.zeros(n, dtype=float)
        if n == 0:
            return movement_distances, trail_amounts, self.positions.copy()

        active = self.alive.copy()
        if not np.any(active):
            return movement_distances, trail_amounts, self.positions.copy()

        sensory = self.compute_sensory_field()
        active_idx = np.flatnonzero(active)
        headings = self.headings[active_idx]
        positions = self.positions[active_idx]

        front = positions + p.sensor_distance * np.column_stack([np.cos(headings), np.sin(headings)])
        left = positions + p.sensor_distance * np.column_stack(
            [np.cos(headings + p.sensor_angle), np.sin(headings + p.sensor_angle)]
        )
        right = positions + p.sensor_distance * np.column_stack(
            [np.cos(headings - p.sensor_angle), np.sin(headings - p.sensor_angle)]
        )
        outside_value = -p.w_obstacle
        s0 = bilinear_sample(sensory, front, p.boundary_mode, outside_value)
        sl = bilinear_sample(sensory, left, p.boundary_mode, outside_value)
        sr = bilinear_sample(sensory, right, p.boundary_mode, outside_value)
        values = np.vstack([s0, sl, sr]).T
        best = np.argmax(values, axis=1)
        smax = np.max(values, axis=1)

        deterministic_turn = np.zeros_like(headings)
        deterministic_turn[best == 1] = p.rotation_angle
        deterministic_turn[best == 2] = -p.rotation_angle

        energy_ratio = np.clip(self.energies[active_idx] / max(p.E_max, EPS), 0.0, 1.0)
        p_energy = sigmoid(p.k_E * (energy_ratio - p.theta_E))
        p_signal = sigmoid(p.k_S * (smax - p.search_threshold))
        p_search = p_energy * (1.0 - p_signal)
        random_draw = self.rng.random(len(active_idx))

        new_modes = np.where(random_draw < p_search, MODE_SEARCH, MODE_EXPLOIT).astype(np.int8)
        dormant_mask = (energy_ratio < p.theta_dormant) & (smax < p.search_threshold)
        if p.keep_searching_without_food and self.active_food_count() == 0:
            new_modes[:] = MODE_SEARCH
        new_modes[dormant_mask] = MODE_DORMANT
        self.modes[active_idx] = new_modes

        noise_needed = (new_modes == MODE_SEARCH) | (smax < p.search_threshold)
        random_turn = np.zeros_like(headings)
        random_turn[noise_needed] = self.rng.normal(0.0, p.random_turn_sigma, size=np.sum(noise_needed))
        new_headings = wrap_angle(headings + deterministic_turn + random_turn)
        self.headings[active_idx] = new_headings

        speed_factor = np.clip(
            p.min_speed / max(p.move_distance, EPS)
            + (1.0 - p.min_speed / max(p.move_distance, EPS)) * energy_ratio,
            p.min_speed / max(p.move_distance, EPS),
            1.0,
        )
        mode_speed = np.ones_like(speed_factor)
        mode_speed[new_modes == MODE_EXPLOIT] = p.v_exploit
        mode_speed[new_modes == MODE_DORMANT] = 0.0
        speeds = p.move_distance * speed_factor * mode_speed

        old_positions = self.positions[active_idx].copy()
        proposed = old_positions + (speeds * p.dt)[:, None] * np.column_stack(
            [np.cos(new_headings), np.sin(new_headings)]
        )
        proposed, reflected_headings = self._handle_boundaries(proposed, new_headings)
        self.headings[active_idx] = reflected_headings

        obstacle_hits = self._positions_in_obstacles(proposed)
        if np.any(obstacle_hits):
            proposed[obstacle_hits] = old_positions[obstacle_hits]
            self.headings[active_idx[obstacle_hits]] = wrap_angle(
                self.headings[active_idx[obstacle_hits]]
                + np.pi
                + self.rng.uniform(-np.pi / 4.0, np.pi / 4.0, size=np.sum(obstacle_hits))
            )

        self.positions[active_idx] = proposed
        movement_distances[active_idx] = np.linalg.norm(proposed - old_positions, axis=1)

        energy_phi = np.clip(self.energies / max(p.E_max, EPS), 0.0, 1.0)
        mode_phi = np.zeros(n, dtype=float)
        mode_phi[self.modes == MODE_SEARCH] = 1.0
        mode_phi[self.modes == MODE_EXPLOIT] = p.rho_exploit_deposit
        trail_amounts = p.trail_deposit_base * self.masses * energy_phi * mode_phi
        trail_amounts[~self.alive] = 0.0
        deposit_positions = self.positions.copy()
        return movement_distances, trail_amounts, deposit_positions

    def update_food_consumption(self) -> np.ndarray:
        """Consume nearby food with proportional sharing per source."""

        p = self.params
        n = len(self.positions)
        gains = np.zeros(n, dtype=float)
        if n == 0 or not self.food_sources or not np.any(self.alive):
            return gains

        can_eat = self.alive & (self.modes != MODE_DORMANT)
        if not np.any(can_eat):
            return gains

        active_idx = np.flatnonzero(can_eat)
        active_positions = self.positions[active_idx]
        for food in self.food_sources:
            if food.calories <= p.food_min_calories:
                continue
            distances = np.linalg.norm(active_positions - np.array([food.x, food.y]), axis=1)
            near = distances <= (p.eat_radius + getattr(food, "radius", p.default_food_radius))
            if not np.any(near):
                continue
            demand = p.bite_rate * p.dt * near.astype(float)
            total_demand = float(np.sum(demand))
            if total_demand <= 0.0:
                continue
            share = min(1.0, food.calories / (total_demand + EPS))
            eaten = demand * share
            food.calories = max(0.0, food.calories - float(np.sum(eaten)))
            gains[active_idx] += p.food_efficiency * food.quality * eaten
        return gains

    def update_energy_growth_division(
        self,
        food_gains: np.ndarray,
        movement_distances: np.ndarray,
        trail_amounts: np.ndarray,
    ) -> None:
        """Update energy, growth, division, death, and dormancy."""

        p = self.params
        n = len(self.positions)
        if n == 0:
            return
        food_gains = self._pad_to_current(food_gains)
        movement_distances = self._pad_to_current(movement_distances)
        trail_amounts = self._pad_to_current(trail_amounts)

        alive = self.alive.copy()
        base_cost = p.c_base * self.masses * p.dt
        move_cost = p.c_move * self.masses * movement_distances
        trail_cost = p.trail_cost * trail_amounts
        dormant_cost = np.zeros(n, dtype=float)
        dormant_cost[self.modes == MODE_DORMANT] = p.c_dormant * self.masses[self.modes == MODE_DORMANT] * p.dt
        total_cost = base_cost + move_cost + trail_cost + dormant_cost

        self.energies[alive] = np.clip(
            self.energies[alive] + food_gains[alive] - total_cost[alive],
            0.0,
            p.E_max,
        )

        growth_signal = np.maximum(self.energies / max(p.E_max, EPS) - p.growth_threshold, 0.0)
        delta_mass = p.growth_rate * growth_signal * self.masses * p.dt
        delta_mass[~alive] = 0.0
        growth_energy_cost = p.c_growth * delta_mass
        self.masses += delta_mass
        self.energies = np.clip(self.energies - growth_energy_cost, 0.0, p.E_max)

        self._divide_eligible_agents()
        self._apply_death_or_dormancy()

    def update_trail(self, positions: np.ndarray, trail_amounts: np.ndarray) -> None:
        """Deposit, diffuse, decay, and clip the trail field."""

        p = self.params
        self.prev_trail = self.trail.copy()
        if len(positions) == 0:
            deposition = np.zeros_like(self.trail)
        else:
            deposition = bilinear_splat(self.trail.shape, positions, trail_amounts, p.boundary_mode)
        field = self.trail + deposition
        if p.trail_diffusion > 0.0:
            field = gaussian_filter(field, sigma=p.trail_diffusion, mode="wrap" if p.boundary_mode == "wrap" else "nearest")
        field *= max(0.0, 1.0 - p.trail_decay * p.dt)
        field[self.obstacle_mask] = 0.0
        self.trail = np.maximum(field, 0.0)

    def get_metrics(self) -> dict[str, float]:
        """Return current scalar metrics."""

        alive_count = int(np.sum(self.alive))
        alive_energy = self.energies[self.alive]
        trail_sum = float(np.sum(self.trail))
        probs = self.trail.ravel() / (trail_sum + EPS)
        entropy = float(-np.sum(probs * np.log(probs + EPS)))
        food_total = self.total_food_calories()

        network_metrics: dict[str, float] = {}
        if self.network_solver is not None:
            network_metrics = self.network_solver.get_metrics()

        return {
            "step": float(self.step_count),
            "alive_agents": float(alive_count),
            "average_energy": float(np.sum(alive_energy) / (alive_count + EPS)),
            "total_agent_energy": float(np.sum(alive_energy)),
            "total_biomass": float(np.sum(self.masses[self.alive])),
            "remaining_food_calories": float(food_total),
            "consumed_food_calories": float(max(0.0, self.initial_food_total - food_total)),
            "trail_mass": trail_sum,
            "trail_coverage": float(np.sum(self.trail > self.params.trail_coverage_threshold)),
            "trail_entropy": entropy,
            "network_total_length": float(network_metrics.get("network_total_length", 0.0)),
            "network_weighted_cost": float(network_metrics.get("network_weighted_cost", 0.0)),
            "network_efficiency": float(network_metrics.get("network_efficiency", 0.0)),
            "network_fault_tolerance": float(network_metrics.get("network_fault_tolerance", 0.0)),
            "shortest_path_length": float(network_metrics.get("shortest_path_length", 0.0)),
            "shortest_path_cost": float(network_metrics.get("shortest_path_cost", 0.0)),
        }

    def get_food_dataframe(self) -> pd.DataFrame:
        """Return food sources as a DataFrame."""

        rows = [
            {
                "id": idx,
                "x": food.x,
                "y": food.y,
                "calories": food.calories,
                "initial_calories": getattr(food, "initial_calories", food.calories),
                "quality": food.quality,
                "sigma": food.sigma,
                "radius": getattr(food, "radius", self.params.default_food_radius),
                "active": food.calories > self.params.food_min_calories,
            }
            for idx, food in enumerate(self.food_sources)
        ]
        return pd.DataFrame(rows)

    def get_agent_summary(self) -> pd.DataFrame:
        """Return summary statistics for agents."""

        if len(self.positions) == 0:
            return pd.DataFrame([{"statistic": "agents", "value": 0.0}])

        rows: list[dict[str, Any]] = [
            {"statistic": "total_agents_array", "value": float(len(self.positions))},
            {"statistic": "alive_agents", "value": float(np.sum(self.alive))},
            {"statistic": "mean_energy_alive", "value": float(np.mean(self.energies[self.alive])) if np.any(self.alive) else 0.0},
            {"statistic": "mean_mass_alive", "value": float(np.mean(self.masses[self.alive])) if np.any(self.alive) else 0.0},
            {"statistic": "search_mode", "value": float(np.sum(self.alive & (self.modes == MODE_SEARCH)))},
            {"statistic": "exploit_mode", "value": float(np.sum(self.alive & (self.modes == MODE_EXPLOIT)))},
            {"statistic": "dormant_mode", "value": float(np.sum(self.alive & (self.modes == MODE_DORMANT)))},
        ]
        return pd.DataFrame(rows)

    def to_params_json(self) -> str:
        """Serialize parameters to JSON."""

        return json.dumps(asdict(self.params), indent=2, sort_keys=True)

    def export_metrics_dataframe(self, metric_history: list[dict[str, float]] | None = None) -> pd.DataFrame:
        """Build a metrics DataFrame from a history list or current state."""

        if metric_history:
            return pd.DataFrame(metric_history)
        return pd.DataFrame([self.get_metrics()])

    def total_food_calories(self) -> float:
        return float(sum(food.calories for food in self.food_sources))

    def colony_center(self) -> np.ndarray:
        """Energy-weighted centroid with a stable fallback."""

        if len(self.positions) == 0 or not np.any(self.alive):
            return self.previous_colony_center.copy()
        weights = self.energies * self.alive.astype(float)
        denom = float(np.sum(weights))
        if denom <= EPS:
            center = np.mean(self.positions[self.alive], axis=0) if np.any(self.alive) else self.previous_colony_center
        else:
            center = np.sum(self.positions * weights[:, None], axis=0) / (denom + EPS)
        self.previous_colony_center = center
        return center

    def _maybe_update_network(self) -> None:
        p = self.params
        self._sync_network()
        if self.network_solver is None:
            return
        interval = max(1, int(p.network_update_every))
        if self.step_count % interval != 0:
            return
        self.network_solver.build_graph(
            self.colony_center(),
            self.food_sources,
            trail_field=self.trail if p.include_trail_landmarks else None,
            obstacle_mask=self.obstacle_mask if p.obstacle_check_edges else None,
        )
        self.network_solver.step()
        reinforcement = self.network_solver.rasterize_reinforcement_to_trail(self.trail.shape)
        if reinforcement.size:
            self.trail = np.maximum(self.trail + reinforcement, 0.0)
            self.trail[self.obstacle_mask] = 0.0

    def _apply_position_bounds(self, positions: np.ndarray) -> np.ndarray:
        p = self.params
        positions = positions.copy()
        if p.boundary_mode == "wrap":
            positions[:, 0] = np.mod(positions[:, 0], p.W)
            positions[:, 1] = np.mod(positions[:, 1], p.H)
        else:
            positions[:, 0] = np.clip(positions[:, 0], 0.0, p.W - EPS)
            positions[:, 1] = np.clip(positions[:, 1], 0.0, p.H - EPS)
        return positions

    def _handle_boundaries(self, positions: np.ndarray, headings: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        p = self.params
        positions = positions.copy()
        headings = headings.copy()
        if p.boundary_mode == "wrap":
            positions[:, 0] = np.mod(positions[:, 0], p.W)
            positions[:, 1] = np.mod(positions[:, 1], p.H)
            return positions, headings

        left = positions[:, 0] < 0.0
        right = positions[:, 0] >= p.W
        if np.any(left | right):
            headings[left | right] = np.pi - headings[left | right]
            positions[left, 0] = -positions[left, 0]
            positions[right, 0] = 2.0 * (p.W - EPS) - positions[right, 0]

        bottom = positions[:, 1] < 0.0
        top = positions[:, 1] >= p.H
        if np.any(bottom | top):
            headings[bottom | top] = -headings[bottom | top]
            positions[bottom, 1] = -positions[bottom, 1]
            positions[top, 1] = 2.0 * (p.H - EPS) - positions[top, 1]

        positions[:, 0] = np.clip(positions[:, 0], 0.0, p.W - EPS)
        positions[:, 1] = np.clip(positions[:, 1], 0.0, p.H - EPS)
        return positions, wrap_angle(headings)

    def _positions_in_obstacles(self, positions: np.ndarray) -> np.ndarray:
        if positions.size == 0 or not np.any(self.obstacle_mask):
            return np.zeros(len(positions), dtype=bool)
        x = np.clip(np.floor(positions[:, 0]).astype(int), 0, self.params.W - 1)
        y = np.clip(np.floor(positions[:, 1]).astype(int), 0, self.params.H - 1)
        return self.obstacle_mask[y, x]

    def _append_agents(
        self,
        positions: np.ndarray,
        headings: np.ndarray,
        energies: np.ndarray,
        masses: np.ndarray,
        alive: np.ndarray,
        modes: np.ndarray,
    ) -> None:
        self.positions = np.vstack([self.positions, positions])
        self.headings = np.concatenate([self.headings, headings])
        self.energies = np.concatenate([self.energies, energies])
        self.masses = np.concatenate([self.masses, masses])
        self.alive = np.concatenate([self.alive, alive])
        self.modes = np.concatenate([self.modes, modes])

    def _divide_eligible_agents(self) -> None:
        p = self.params
        capacity = int(p.max_agents) - len(self.positions)
        if capacity <= 0 or len(self.positions) == 0:
            return
        eligible = np.flatnonzero(self.alive & (self.energies > p.split_energy))
        if eligible.size == 0:
            return
        if eligible.size > capacity:
            eligible = self.rng.choice(eligible, size=capacity, replace=False)

        child_positions = self.positions[eligible] + self.rng.normal(
            0.0,
            p.split_position_sigma,
            size=(eligible.size, 2),
        )
        child_positions = self._apply_position_bounds(child_positions)
        blocked = self._positions_in_obstacles(child_positions)
        if np.any(blocked):
            child_positions[blocked] = self._sample_patch_positions(
                int(np.sum(blocked)),
                self.positions[eligible][blocked][0],
                max(0.75, p.split_position_sigma),
            )
        child_headings = wrap_angle(self.headings[eligible] + self.rng.uniform(-np.pi, np.pi, size=eligible.size))
        child_energies = 0.5 * self.energies[eligible]
        child_masses = 0.5 * self.masses[eligible]

        self.energies[eligible] *= 0.5
        self.masses[eligible] *= 0.5
        self._append_agents(
            child_positions,
            child_headings,
            child_energies,
            child_masses,
            np.ones(eligible.size, dtype=bool),
            np.full(eligible.size, MODE_SEARCH, dtype=np.int8),
        )

    def _apply_death_or_dormancy(self) -> None:
        p = self.params
        if len(self.positions) == 0:
            return
        low = self.alive & (self.energies <= p.death_energy)
        if not np.any(low):
            return
        if p.death_policy == "dormant":
            self.modes[low] = MODE_DORMANT
            self.energies[low] = 0.0
        else:
            self.alive[low] = False
            self._compact_dead()

    def _compact_dead(self) -> None:
        keep = self.alive
        self.positions = self.positions[keep]
        self.headings = self.headings[keep]
        self.energies = self.energies[keep]
        self.masses = self.masses[keep]
        self.modes = self.modes[keep]
        self.alive = np.ones(len(self.positions), dtype=bool)

    def _pad_to_current(self, values: np.ndarray) -> np.ndarray:
        n = len(self.positions)
        if len(values) == n:
            return values
        padded = np.zeros(n, dtype=float)
        m = min(n, len(values))
        padded[:m] = values[:m]
        return padded
