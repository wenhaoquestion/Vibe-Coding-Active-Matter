"""Physarum-inspired adaptive transport-network solver."""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
from typing import Any
import warnings

import networkx as nx
import numpy as np
from scipy import sparse
from scipy.sparse.linalg import MatrixRankWarning, spsolve

try:
    from scipy.spatial import Delaunay
except Exception:  # pragma: no cover - SciPy spatial is optional for this layer.
    Delaunay = None  # type: ignore[assignment]


EPS = 1.0e-9


@dataclass
class NetworkParams:
    """Parameters for the adaptive transport network."""

    k_neighbors: int = 4
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
    edge_sigma: float = 1.5
    obstacle_check_edges: bool = True
    dt: float = 1.0


class PhysarumNetworkSolver:
    """Adaptive tube-flow network over food, nest, and optional trail landmarks."""

    def __init__(self, params: NetworkParams):
        self.params = params
        self.graph = nx.Graph()
        self.conductance_memory: dict[tuple[tuple[float, float], tuple[float, float]], float] = {}
        self.pressures: dict[Any, float] = {}
        self.primary_path: list[Any] = []
        self.primary_path_length = 0.0
        self.primary_path_cost = 0.0
        self.metrics: dict[str, float] = {}

    def build_graph(
        self,
        nest_point: np.ndarray,
        food_sources: list[Any],
        trail_field: np.ndarray | None = None,
        obstacle_mask: np.ndarray | None = None,
    ) -> nx.Graph:
        """Build a k-nearest-neighbor graph and preserve conductances when possible."""

        active_food = [food for food in food_sources if getattr(food, "calories", 0.0) > 1.0e-6]
        self.graph = nx.Graph()
        self.primary_path = []
        self.primary_path_length = 0.0
        self.primary_path_cost = 0.0
        self.metrics = {}

        if not active_food:
            return self.graph

        nest = np.asarray(nest_point, dtype=float)
        self.graph.add_node("nest", pos=(float(nest[0]), float(nest[1])), kind="nest", calories=0.0)

        for idx, food in enumerate(active_food):
            node = f"food_{idx}"
            self.graph.add_node(
                node,
                pos=(float(food.x), float(food.y)),
                kind="food",
                calories=float(food.calories),
                quality=float(getattr(food, "quality", 1.0)),
            )

        if self.params.include_trail_landmarks and trail_field is not None:
            self._add_trail_landmarks(trail_field)

        if self.params.dense_graph_support_nodes > 0 and trail_field is not None:
            self._add_support_nodes(trail_field.shape, self.params.dense_graph_support_nodes)

        if self.graph.number_of_nodes() < 2:
            return self.graph

        self._add_knn_edges(obstacle_mask)
        self._add_delaunay_edges(obstacle_mask)
        return self.graph

    def update_conductance(self) -> None:
        """Apply flow-dependent reinforcement and decay."""

        p = self.params
        for u, v, data in self.graph.edges(data=True):
            q_abs = abs(float(data.get("flow", 0.0)))
            f_q = q_abs**p.gamma / (q_abs**p.gamma + p.q0_flow**p.gamma + EPS)
            conductance = max(
                p.D_min,
                float(data.get("conductance", p.D_init))
                + p.dt * (p.alpha_D * f_q - p.mu_D * float(data.get("conductance", p.D_init))),
            )
            data["conductance"] = conductance
            self.conductance_memory[self._edge_key_from_nodes(u, v)] = conductance

    def solve_pressures(self) -> dict[Any, float]:
        """Solve the singular graph Laplacian after fixing the nest pressure."""

        if self.graph.number_of_nodes() < 2 or self.graph.number_of_edges() == 0:
            self.pressures = {}
            return self.pressures

        nodes = list(self.graph.nodes)
        node_index = {node: idx for idx, node in enumerate(nodes)}
        edges = list(self.graph.edges)
        n_nodes = len(nodes)
        n_edges = len(edges)

        rows: list[int] = []
        cols: list[int] = []
        vals: list[float] = []
        g_values = np.zeros(n_edges, dtype=float)
        for e_idx, (u, v) in enumerate(edges):
            rows.extend([node_index[u], node_index[v]])
            cols.extend([e_idx, e_idx])
            vals.extend([1.0, -1.0])
            data = self.graph.edges[u, v]
            g_values[e_idx] = float(data["conductance"]) / (float(data["length"]) + EPS)

        incidence = sparse.coo_matrix((vals, (rows, cols)), shape=(n_nodes, n_edges)).tocsr()
        laplacian = incidence @ sparse.diags(g_values) @ incidence.T
        b = self._source_sink_vector(nodes)

        if np.allclose(b, 0.0):
            self.pressures = {node: 0.0 for node in nodes}
            nx.set_node_attributes(self.graph, self.pressures, "pressure")
            return self.pressures

        gauge_idx = node_index.get("nest", 0)
        keep = np.array([i for i in range(n_nodes) if i != gauge_idx], dtype=int)
        reduced_laplacian = laplacian[keep][:, keep]
        reduced_b = b[keep]

        pressures = np.zeros(n_nodes, dtype=float)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", MatrixRankWarning)
                pressures[keep] = spsolve(reduced_laplacian.tocsr(), reduced_b)
            if not np.all(np.isfinite(pressures[keep])):
                raise np.linalg.LinAlgError("non-finite sparse pressure solution")
        except Exception:
            pressures[keep] = np.linalg.lstsq(reduced_laplacian.toarray(), reduced_b, rcond=None)[0]

        self.pressures = {node: float(pressures[node_index[node]]) for node in nodes}
        nx.set_node_attributes(self.graph, self.pressures, "pressure")
        return self.pressures

    def compute_flows(self) -> dict[tuple[Any, Any], float]:
        """Compute signed edge flows from pressure drops."""

        flows: dict[tuple[Any, Any], float] = {}
        if not self.pressures:
            return flows
        for u, v, data in self.graph.edges(data=True):
            g = float(data["conductance"]) / (float(data["length"]) + EPS)
            flow = g * (self.pressures[u] - self.pressures[v])
            data["flow"] = float(flow)
            flows[(u, v)] = float(flow)
        return flows

    def step(self) -> None:
        """Solve pressure/flow, adapt conductances, and update path metrics."""

        if self.graph.number_of_nodes() < 2 or self.graph.number_of_edges() == 0:
            self.metrics = {}
            return
        self.solve_pressures()
        self.compute_flows()
        self.update_conductance()
        self.compute_shortest_paths()

    def compute_shortest_paths(self) -> dict[str, Any]:
        """Compute Dijkstra overlays and network metrics after conductance adaptation."""

        if self.graph.number_of_nodes() < 2:
            self.metrics = {}
            return {}

        for _, _, data in self.graph.edges(data=True):
            data["path_cost"] = float(data["length"]) / (float(data["conductance"]) + EPS) ** self.params.path_eta

        food_nodes = [
            node
            for node, data in self.graph.nodes(data=True)
            if data.get("kind") == "food" and float(data.get("calories", 0.0)) > 1.0e-6
        ]
        if not food_nodes:
            self.primary_path = []
            self.metrics = {}
            return {}

        primary = max(food_nodes, key=lambda node: float(self.graph.nodes[node].get("calories", 0.0)))
        try:
            self.primary_path = nx.dijkstra_path(self.graph, "nest", primary, weight="path_cost")
            self.primary_path_length = self._path_sum(self.primary_path, "length")
            self.primary_path_cost = self._path_sum(self.primary_path, "path_cost")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            self.primary_path = []
            self.primary_path_length = 0.0
            self.primary_path_cost = 0.0

        self.metrics = self._compute_metrics()
        return {
            "primary_node": primary,
            "primary_path": self.primary_path,
            "primary_path_length": self.primary_path_length,
            "primary_path_cost": self.primary_path_cost,
        }

    def get_edges_for_plot(self) -> list[dict[str, float]]:
        """Return edge geometry and data for visualization."""

        rows: list[dict[str, float]] = []
        for u, v, data in self.graph.edges(data=True):
            if u not in self.graph.nodes or v not in self.graph.nodes:
                continue
            if "pos" not in self.graph.nodes[u] or "pos" not in self.graph.nodes[v]:
                continue
            x0, y0 = self.graph.nodes[u]["pos"]
            x1, y1 = self.graph.nodes[v]["pos"]
            rows.append(
                {
                    "x0": float(x0),
                    "y0": float(y0),
                    "x1": float(x1),
                    "y1": float(y1),
                    "conductance": float(data.get("conductance", 0.0)),
                    "flow": float(data.get("flow", 0.0)),
                    "length": float(data.get("length", 0.0)),
                }
            )
        return rows

    def get_primary_path(self) -> list[tuple[float, float]]:
        """Return primary shortest path coordinates."""

        coords: list[tuple[float, float]] = []
        for node in self.primary_path:
            if node in self.graph.nodes:
                x, y = self.graph.nodes[node]["pos"]
                coords.append((float(x), float(y)))
        return coords

    def get_metrics(self) -> dict[str, float]:
        return dict(self.metrics)

    def rasterize_reinforcement_to_trail(self, shape: tuple[int, int]) -> np.ndarray:
        """Rasterize reinforced flow-carrying edges into a trail increment."""

        h, w = shape
        field = np.zeros(shape, dtype=float)
        if self.graph.number_of_edges() == 0:
            return field

        max_flow = max((abs(float(data.get("flow", 0.0))) for _, _, data in self.graph.edges(data=True)), default=0.0)
        if max_flow <= EPS:
            return field

        sigma = max(self.params.edge_sigma, 0.25)
        radius = max(1, int(np.ceil(3.0 * sigma)))
        for u, v, data in self.graph.edges(data=True):
            if u not in self.graph.nodes or v not in self.graph.nodes:
                continue
            if "pos" not in self.graph.nodes[u] or "pos" not in self.graph.nodes[v]:
                continue
            flow_ratio = abs(float(data.get("flow", 0.0))) / (max_flow + EPS)
            amount = self.params.rho_network * float(data.get("conductance", 0.0)) * flow_ratio
            if amount <= 0.0:
                continue
            x0, y0 = self.graph.nodes[u]["pos"]
            x1, y1 = self.graph.nodes[v]["pos"]
            length = max(float(data.get("length", 0.0)), 1.0)
            samples = max(2, int(np.ceil(length)))
            for t in np.linspace(0.0, 1.0, samples):
                x = (1.0 - t) * x0 + t * x1
                y = (1.0 - t) * y0 + t * y1
                xi = int(round(x))
                yi = int(round(y))
                for yy in range(max(0, yi - radius), min(h, yi + radius + 1)):
                    for xx in range(max(0, xi - radius), min(w, xi + radius + 1)):
                        d2 = (xx - x) ** 2 + (yy - y) ** 2
                        field[yy, xx] += amount * np.exp(-d2 / (2.0 * sigma**2)) / samples
        return field

    def _add_trail_landmarks(self, trail_field: np.ndarray) -> None:
        count = max(0, int(self.params.max_trail_landmarks))
        if count <= 0 or trail_field.size == 0 or float(np.max(trail_field)) <= EPS:
            return

        flat = trail_field.ravel()
        positive = np.flatnonzero(flat > np.percentile(flat, 90))
        if positive.size == 0:
            positive = np.flatnonzero(flat > EPS)
        if positive.size == 0:
            return

        take = min(count * 5, positive.size)
        strongest = positive[np.argpartition(flat[positive], -take)[-take:]]
        strongest = strongest[np.argsort(flat[strongest])[::-1]]

        selected: list[tuple[float, float]] = []
        h, w = trail_field.shape
        for flat_idx in strongest:
            y, x = divmod(int(flat_idx), w)
            pt = np.array([float(x), float(y)])
            if selected and min(np.linalg.norm(pt - np.array(existing)) for existing in selected) < 4.0:
                continue
            selected.append((float(x), float(y)))
            if len(selected) >= count:
                break

        for idx, (x, y) in enumerate(selected):
            self.graph.add_node(f"trail_{idx}", pos=(x, y), kind="trail", calories=0.0)

    def _add_support_nodes(self, shape: tuple[int, int], count: int) -> None:
        h, w = shape
        rng = np.random.default_rng(12345)
        for idx in range(max(0, int(count))):
            self.graph.add_node(
                f"support_{idx}",
                pos=(float(rng.uniform(0, w)), float(rng.uniform(0, h))),
                kind="support",
                calories=0.0,
            )

    def _add_knn_edges(self, obstacle_mask: np.ndarray | None) -> None:
        nodes = list(self.graph.nodes)
        coords = np.array([self.graph.nodes[node]["pos"] for node in nodes], dtype=float)
        if len(nodes) < 2:
            return
        diff = coords[:, None, :] - coords[None, :, :]
        distances = np.linalg.norm(diff, axis=2)
        k = max(1, min(self.params.k_neighbors, len(nodes) - 1))
        for i, node in enumerate(nodes):
            nearest = np.argsort(distances[i])[1 : k + 1]
            for j in nearest:
                self._try_add_edge(node, nodes[j], distances[i, j], obstacle_mask)

    def _add_delaunay_edges(self, obstacle_mask: np.ndarray | None) -> None:
        if Delaunay is None or self.graph.number_of_nodes() < 3:
            return
        nodes = list(self.graph.nodes)
        coords = np.array([self.graph.nodes[node]["pos"] for node in nodes], dtype=float)
        try:
            tri = Delaunay(coords)
        except Exception:
            return
        for simplex in tri.simplices:
            for a, b in combinations(simplex, 2):
                u, v = nodes[int(a)], nodes[int(b)]
                length = float(np.linalg.norm(coords[int(a)] - coords[int(b)]))
                self._try_add_edge(u, v, length, obstacle_mask)

    def _try_add_edge(self, u: Any, v: Any, length: float, obstacle_mask: np.ndarray | None) -> None:
        if u == v or self.graph.has_edge(u, v):
            return
        if length <= EPS:
            return
        if u not in self.graph.nodes or v not in self.graph.nodes:
            return
        if "pos" not in self.graph.nodes[u] or "pos" not in self.graph.nodes[v]:
            return
        if self.params.obstacle_check_edges and obstacle_mask is not None and self._edge_crosses_obstacle(u, v, obstacle_mask):
            return
        key = self._edge_key_from_nodes(u, v)
        conductance = self.conductance_memory.get(key, self.params.D_init)
        self.graph.add_edge(
            u,
            v,
            length=float(length),
            conductance=float(max(conductance, self.params.D_min)),
            flow=0.0,
            path_cost=float(length) / (float(max(conductance, self.params.D_min)) + EPS) ** self.params.path_eta,
        )

    def _edge_crosses_obstacle(self, u: Any, v: Any, obstacle_mask: np.ndarray) -> bool:
        if u not in self.graph.nodes or v not in self.graph.nodes:
            return True
        if "pos" not in self.graph.nodes[u] or "pos" not in self.graph.nodes[v]:
            return True
        x0, y0 = self.graph.nodes[u]["pos"]
        x1, y1 = self.graph.nodes[v]["pos"]
        length = float(np.hypot(x1 - x0, y1 - y0))
        samples = max(2, int(np.ceil(length * 2.0)))
        h, w = obstacle_mask.shape
        for t in np.linspace(0.0, 1.0, samples):
            x = int(np.clip(round((1.0 - t) * x0 + t * x1), 0, w - 1))
            y = int(np.clip(round((1.0 - t) * y0 + t * y1), 0, h - 1))
            if obstacle_mask[y, x]:
                return True
        return False

    def _source_sink_vector(self, nodes: list[Any]) -> np.ndarray:
        b = np.zeros(len(nodes), dtype=float)
        food_indices = [
            idx
            for idx, node in enumerate(nodes)
            if self.graph.nodes[node].get("kind") == "food" and float(self.graph.nodes[node].get("calories", 0.0)) > 1.0e-6
        ]
        total_calories = sum(float(self.graph.nodes[nodes[idx]].get("calories", 0.0)) for idx in food_indices)
        if total_calories <= EPS or not food_indices:
            return b
        for idx in food_indices:
            b[idx] = self.params.I0 * float(self.graph.nodes[nodes[idx]].get("calories", 0.0)) / (total_calories + EPS)
        if "nest" in nodes:
            b[nodes.index("nest")] = -float(np.sum(b))
        return b

    def _compute_metrics(self) -> dict[str, float]:
        active_edges = [
            (u, v, data)
            for u, v, data in self.graph.edges(data=True)
            if float(data.get("conductance", 0.0)) > self.params.D_vis
        ]
        total_length = float(sum(float(data.get("length", 0.0)) for _, _, data in active_edges))
        weighted_cost = float(
            sum(float(data.get("length", 0.0)) * float(data.get("conductance", 0.0)) for _, _, data in self.graph.edges(data=True))
        )

        distances = []
        for u, v in combinations(self.graph.nodes, 2):
            try:
                distances.append(nx.dijkstra_path_length(self.graph, u, v, weight="path_cost"))
            except (nx.NetworkXNoPath, nx.NodeNotFound):
                continue
        if distances:
            avg_distance = float(np.mean(distances))
            efficiency = float(np.mean([1.0 / (d + EPS) for d in distances]))
        else:
            avg_distance = 0.0
            efficiency = 0.0

        fault_tolerance = self._fault_tolerance(active_edges)
        return {
            "network_total_length": total_length,
            "network_weighted_cost": weighted_cost,
            "average_pairwise_transport_distance": avg_distance,
            "network_efficiency": efficiency,
            "network_fault_tolerance": fault_tolerance,
            "shortest_path_length": float(self.primary_path_length),
            "shortest_path_cost": float(self.primary_path_cost),
        }

    def _fault_tolerance(self, active_edges: list[tuple[Any, Any, dict[str, Any]]]) -> float:
        if not active_edges:
            return 0.0
        active_graph = nx.Graph()
        active_graph.add_nodes_from(self.graph.nodes(data=True))
        active_graph.add_edges_from((u, v, data) for u, v, data in active_edges)
        food_nodes = [
            node
            for node, data in active_graph.nodes(data=True)
            if data.get("kind") == "food" and float(data.get("calories", 0.0)) > 1.0e-6
        ]
        if not food_nodes:
            return 0.0
        robust = 0
        for u, v, _ in active_edges:
            test_graph = active_graph.copy()
            test_graph.remove_edge(u, v)
            if all(nx.has_path(test_graph, "nest", food) for food in food_nodes if "nest" in test_graph):
                robust += 1
        return float(robust / (len(active_edges) + EPS))

    def _path_sum(self, path: list[Any], attr: str) -> float:
        total = 0.0
        for u, v in zip(path[:-1], path[1:]):
            if self.graph.has_edge(u, v):
                total += float(self.graph.edges[u, v].get(attr, 0.0))
        return float(total)

    def _edge_key_from_nodes(self, u: Any, v: Any) -> tuple[tuple[float, float], tuple[float, float]]:
        a = tuple(round(float(z), 2) for z in self.graph.nodes[u]["pos"])
        b = tuple(round(float(z), 2) for z in self.graph.nodes[v]["pos"])
        return tuple(sorted((a, b)))  # type: ignore[return-value]
