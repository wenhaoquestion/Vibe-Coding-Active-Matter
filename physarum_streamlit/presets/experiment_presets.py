"""Built-in Physarum plate and maze experiment presets."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation

from simulation import PhysarumSimulation, SimParams


EXPERIMENT_PRESETS = [
    "custom",
    "multi_food_plate",
    "simple_maze",
    "two_food_shortest_path",
    "obstacle_plate",
]

WORLD_PRESETS = ["empty", "petri_dish", "simple_maze", "random_maze", "uploaded_mask"]


def apply_experiment_preset(params: SimParams, preset: str) -> tuple[PhysarumSimulation, SimParams, str]:
    """Create a new simulation from a named biological experiment preset."""

    if preset == "multi_food_plate":
        p = replace(
            params,
            W=160,
            H=100,
            initial_agents=1200,
            max_agents=5000,
            initial_food_count=0,
            agent_init_mode="edge_patch",
            patch_sigma=3.5,
            boundary_mode="bounce",
            random_seed=int(params.random_seed),
        )
        sim = PhysarumSimulation(p)
        _add_multi_food(sim, count=30)
        sim.reset_agents_patch(p.W * 0.13, p.H * 0.16, sigma=3.5)
        visual_mode = "petri_dish"
    elif preset == "simple_maze":
        p = replace(
            params,
            W=160,
            H=100,
            initial_agents=900,
            max_agents=3500,
            initial_food_count=0,
            agent_init_mode="manual_patch",
            patch_center_x=10.0,
            patch_center_y=18.0,
            patch_sigma=2.0,
            boundary_mode="bounce",
            random_seed=int(params.random_seed),
        )
        sim = PhysarumSimulation(p)
        sim.set_obstacle_mask(make_simple_maze_mask(p.W, p.H))
        _add_open_food(sim, p.W - 14, p.H * 0.35, calories=1100.0, radius=4.3)
        _add_open_food(sim, p.W * 0.74, p.H * 0.72, calories=520.0, radius=3.2)
        sim.reset_agents_patch(10.0, p.H * 0.18, count=p.initial_agents, sigma=2.0)
        visual_mode = "maze"
    elif preset == "two_food_shortest_path":
        p = replace(
            params,
            W=130,
            H=86,
            initial_agents=900,
            max_agents=3600,
            initial_food_count=0,
            agent_init_mode="central_patch",
            patch_sigma=2.6,
            boundary_mode="bounce",
            random_seed=int(params.random_seed),
        )
        sim = PhysarumSimulation(p)
        _add_open_food(sim, p.W * 0.22, p.H * 0.78, calories=650.0, radius=3.7)
        _add_open_food(sim, p.W * 0.82, p.H * 0.28, calories=1250.0, radius=4.8)
        sim.reset_agents_patch(p.W * 0.48, p.H * 0.48, sigma=2.6)
        visual_mode = "petri_dish"
    elif preset == "obstacle_plate":
        p = replace(
            params,
            W=150,
            H=96,
            initial_agents=1000,
            max_agents=4200,
            initial_food_count=0,
            agent_init_mode="edge_patch",
            patch_sigma=3.0,
            boundary_mode="bounce",
            random_seed=int(params.random_seed),
        )
        sim = PhysarumSimulation(p)
        mask = np.zeros((p.H, p.W), dtype=bool)
        _rect(mask, p.W * 0.30, p.H * 0.20, p.W * 0.41, p.H * 0.66)
        _rect(mask, p.W * 0.55, p.H * 0.35, p.W * 0.68, p.H * 0.84)
        _rect(mask, p.W * 0.72, p.H * 0.10, p.W * 0.82, p.H * 0.38)
        sim.set_obstacle_mask(mask)
        for x, y, c in [
            (p.W * 0.18, p.H * 0.80, 500.0),
            (p.W * 0.50, p.H * 0.76, 850.0),
            (p.W * 0.86, p.H * 0.72, 720.0),
            (p.W * 0.88, p.H * 0.22, 950.0),
            (p.W * 0.46, p.H * 0.18, 540.0),
        ]:
            _add_open_food(sim, x, y, calories=c, radius=3.6)
        sim.reset_agents_patch(p.W * 0.12, p.H * 0.15, sigma=3.0)
        visual_mode = "petri_dish"
    else:
        p = replace(params)
        sim = PhysarumSimulation(p)
        visual_mode = "petri_dish"

    sim.compute_food_field()
    sim.initial_food_total = sim.total_food_calories()
    sim.prev_trail = sim.trail.copy()
    return sim, p, visual_mode


def apply_world_preset(sim: PhysarumSimulation, preset: str, uploaded_file: Any | None = None) -> str:
    """Apply only the world obstacle mask to an existing simulation."""

    if preset in {"empty", "petri_dish"}:
        sim.set_obstacle_mask(np.zeros_like(sim.obstacle_mask, dtype=bool))
        return "petri_dish"
    if preset == "simple_maze":
        sim.set_obstacle_mask(make_simple_maze_mask(sim.params.W, sim.params.H))
        return "maze"
    if preset == "random_maze":
        sim.set_obstacle_mask(make_random_maze_mask(sim.params.W, sim.params.H, seed=sim.params.random_seed))
        return "maze"
    if preset == "uploaded_mask" and uploaded_file is not None:
        sim.set_obstacle_mask(mask_from_uploaded_image(uploaded_file, sim.params.W, sim.params.H))
        return "maze"
    return "petri_dish"


def make_simple_maze_mask(width: int, height: int) -> np.ndarray:
    """Build a rectangular corridor maze similar to a lab plate maze."""

    mask = np.ones((height, width), dtype=bool)
    corridor = max(4, int(min(width, height) * 0.075))

    def carve(cx0: float, cy0: float, cx1: float, cy1: float) -> None:
        _rect(mask, cx0, cy0, cx1, cy1, value=False)

    y_low = height * 0.18
    y_mid = height * 0.35
    y_high = height * 0.72
    carve(4, y_low - corridor / 2, width * 0.35, y_low + corridor / 2)
    carve(width * 0.29, y_low - corridor / 2, width * 0.35, y_high + corridor / 2)
    carve(width * 0.29, y_high - corridor / 2, width * 0.90, y_high + corridor / 2)
    carve(width * 0.60, y_mid - corridor / 2, width * 0.66, y_high + corridor / 2)
    carve(width * 0.60, y_mid - corridor / 2, width - 5, y_mid + corridor / 2)
    carve(width * 0.46, height * 0.50 - corridor / 2, width * 0.66, height * 0.50 + corridor / 2)
    carve(width * 0.46, height * 0.50 - corridor / 2, width * 0.52, y_high + corridor / 2)
    carve(width * 0.78, y_mid - corridor / 2, width * 0.84, height * 0.58)
    carve(width * 0.72, height * 0.58 - corridor / 2, width * 0.90, height * 0.58 + corridor / 2)

    mask[:, :2] = True
    mask[:, -2:] = True
    mask[:2, :] = True
    mask[-2:, :] = True
    return mask


def make_random_maze_mask(width: int, height: int, seed: int = 42) -> np.ndarray:
    """Generate a recursive-backtracking maze and resize it to the simulation grid."""

    rng = np.random.default_rng(seed)
    cells_w = max(7, width // 8)
    cells_h = max(5, height // 8)
    coarse = np.ones((cells_h * 2 + 1, cells_w * 2 + 1), dtype=bool)
    visited = np.zeros((cells_h, cells_w), dtype=bool)

    stack = [(0, 0)]
    visited[0, 0] = True
    coarse[1, 1] = False
    while stack:
        cy, cx = stack[-1]
        neighbors: list[tuple[int, int, int, int]] = []
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < cells_h and 0 <= nx < cells_w and not visited[ny, nx]:
                neighbors.append((ny, nx, dy, dx))
        if not neighbors:
            stack.pop()
            continue
        ny, nx, dy, dx = neighbors[int(rng.integers(0, len(neighbors)))]
        visited[ny, nx] = True
        coarse[cy * 2 + 1 + dy, cx * 2 + 1 + dx] = False
        coarse[ny * 2 + 1, nx * 2 + 1] = False
        stack.append((ny, nx))

    image = Image.fromarray((coarse.astype(np.uint8) * 255), mode="L")
    image = image.resize((width, height), Image.Resampling.NEAREST)
    mask = np.asarray(image, dtype=np.uint8) > 127
    open_cells = binary_dilation(~mask, iterations=max(1, min(width, height) // 70))
    mask = ~open_cells
    mask[:, :2] = True
    mask[:, -2:] = True
    mask[:2, :] = True
    mask[-2:, :] = True
    return mask


def mask_from_uploaded_image(uploaded_file: Any, width: int, height: int) -> np.ndarray:
    """Convert a black-and-white uploaded mask image into obstacles."""

    image = Image.open(uploaded_file).convert("L")
    image = image.resize((width, height), Image.Resampling.BILINEAR)
    arr = np.asarray(image, dtype=np.uint8)
    mask = arr < 128
    mask[:, :1] = True
    mask[:, -1:] = True
    mask[:1, :] = True
    mask[-1:, :] = True
    return mask


def _add_multi_food(sim: PhysarumSimulation, count: int) -> None:
    rng = np.random.default_rng(sim.params.random_seed + 404)
    margin_x = max(8.0, sim.params.W * 0.09)
    margin_y = max(8.0, sim.params.H * 0.10)
    for _ in range(count):
        x = float(rng.uniform(margin_x, sim.params.W - margin_x))
        y = float(rng.uniform(margin_y, sim.params.H - margin_y))
        calories = float(rng.uniform(280.0, 900.0))
        radius = float(rng.uniform(2.0, 4.8))
        _add_open_food(sim, x, y, calories=calories, radius=radius)


def _add_open_food(sim: PhysarumSimulation, x: float, y: float, *, calories: float, radius: float) -> None:
    point = np.array([[x, y]], dtype=float)
    if not sim._open_position_mask(point)[0]:
        point = sim._sample_random_open_positions(1)
        x, y = float(point[0, 0]), float(point[0, 1])
    sim.add_food(x, y, calories, quality=1.0, sigma=sim.params.sigma_food, radius=radius)


def _rect(mask: np.ndarray, x0: float, y0: float, x1: float, y1: float, value: bool = True) -> None:
    h, w = mask.shape
    xa, xb = sorted((int(np.floor(x0)), int(np.ceil(x1))))
    ya, yb = sorted((int(np.floor(y0)), int(np.ceil(y1))))
    xa = int(np.clip(xa, 0, w - 1))
    xb = int(np.clip(xb, xa + 1, w))
    ya = int(np.clip(ya, 0, h - 1))
    yb = int(np.clip(yb, ya + 1, h))
    mask[ya:yb, xa:xb] = value
