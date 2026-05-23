"""Matplotlib visualization helpers for the Physarum Streamlit app."""

from __future__ import annotations

from typing import Any

import matplotlib.pyplot as plt
from matplotlib.patches import Circle
import numpy as np
import pandas as pd


def plot_simulation(sim: Any, params: Any) -> plt.Figure:
    """Create the main simulation figure."""

    aspect = params.W / max(params.H, 1)
    width = float(params.figure_size)
    height = max(3.0, width / max(aspect, 0.5))
    fig, ax = plt.subplots(figsize=(width, height), constrained_layout=True)

    if params.show_trail_heatmap:
        draw_trail(ax, sim)
    else:
        ax.imshow(
            np.zeros_like(sim.trail),
            origin="lower",
            extent=[0, params.W, 0, params.H],
            cmap="Greys",
            vmin=0,
            vmax=1,
            alpha=0.08,
        )

    if params.show_obstacles:
        draw_obstacles(ax, sim)
    if params.show_network_overlay and sim.network_solver is not None:
        draw_network(ax, sim.network_solver)
    if params.show_shortest_path_overlay and sim.network_solver is not None:
        draw_shortest_path(ax, sim.network_solver)
    if params.show_food:
        draw_food(ax, sim)
    if params.show_agents:
        draw_agents(ax, sim, params)

    ax.set_xlim(0, params.W)
    ax.set_ylim(0, params.H)
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_title(f"Physarum world at step {sim.step_count}")
    ax.grid(False)
    return fig


def draw_trail(ax: plt.Axes, sim: Any) -> None:
    vmax = float(np.percentile(sim.trail, 99.5)) if np.any(sim.trail) else 1.0
    vmax = max(vmax, 1.0e-6)
    image = ax.imshow(
        sim.trail,
        origin="lower",
        extent=[0, sim.params.W, 0, sim.params.H],
        cmap="viridis",
        vmin=0,
        vmax=vmax,
        alpha=0.92,
    )
    if sim.params.show_colorbar:
        ax.figure.colorbar(image, ax=ax, fraction=0.036, pad=0.02, label="trail")


def draw_food(ax: plt.Axes, sim: Any) -> None:
    for idx, food in enumerate(sim.food_sources):
        if food.calories <= sim.params.food_min_calories:
            alpha = 0.25
            edge = "#777777"
            face = "#d9d9d9"
        else:
            alpha = 0.9
            edge = "#1f8a4c"
            face = "#ffd166"
        radius = max(0.6, getattr(food, "radius", sim.params.default_food_radius))
        circ = Circle((food.x, food.y), radius=radius, facecolor=face, edgecolor=edge, linewidth=1.4, alpha=alpha)
        ax.add_patch(circ)
        ax.text(
            food.x + radius + 0.5,
            food.y + radius + 0.5,
            f"F{idx}: {food.calories:.0f}, r={radius:.1f}",
            fontsize=7,
            color="#1b4332",
            ha="left",
            va="bottom",
            bbox={"boxstyle": "round,pad=0.18", "facecolor": "white", "edgecolor": "none", "alpha": 0.68},
        )


def draw_agents(ax: plt.Axes, sim: Any, params: Any) -> None:
    if len(sim.positions) == 0 or not np.any(sim.alive):
        return
    alive_positions = sim.positions[sim.alive]
    alive_modes = sim.modes[sim.alive]
    colors = np.full(len(alive_positions), "#dbeafe", dtype=object)
    colors[alive_modes == 0] = "#f8fafc"
    colors[alive_modes == 1] = "#fb7185"
    colors[alive_modes == 2] = "#94a3b8"
    ax.scatter(
        alive_positions[:, 0],
        alive_positions[:, 1],
        s=params.agent_marker_size,
        c=colors,
        edgecolors="black",
        linewidths=0.15,
        alpha=0.82,
        label="agents",
    )


def draw_obstacles(ax: plt.Axes, sim: Any) -> None:
    if not np.any(sim.obstacle_mask):
        return
    mask = np.ma.masked_where(~sim.obstacle_mask, sim.obstacle_mask)
    ax.imshow(
        mask,
        origin="lower",
        extent=[0, sim.params.W, 0, sim.params.H],
        cmap="gray_r",
        alpha=0.75,
        interpolation="nearest",
    )


def draw_network(ax: plt.Axes, network_solver: Any) -> None:
    edges = network_solver.get_edges_for_plot()
    if not edges:
        return
    max_d = max(edge["conductance"] for edge in edges) or 1.0
    for edge in edges:
        if edge["conductance"] < network_solver.params.D_vis:
            alpha = 0.18
            width = 0.45
        else:
            alpha = 0.28 + 0.62 * edge["conductance"] / (max_d + 1.0e-9)
            width = 0.55 + 4.2 * edge["conductance"] / (max_d + 1.0e-9)
        ax.plot(
            [edge["x0"], edge["x1"]],
            [edge["y0"], edge["y1"]],
            color="#f97316",
            linewidth=width,
            alpha=alpha,
            solid_capstyle="round",
            zorder=4,
        )


def draw_shortest_path(ax: plt.Axes, network_solver: Any) -> None:
    path = network_solver.get_primary_path()
    if len(path) < 2:
        return
    xs, ys = zip(*path)
    ax.plot(xs, ys, color="#0f172a", linewidth=2.2, linestyle="--", alpha=0.95, zorder=6, label="Dijkstra overlay")


def plot_metric_history(metric_df: pd.DataFrame) -> plt.Figure:
    """Plot key simulation and network metrics as time series."""

    fig, axes = plt.subplots(3, 3, figsize=(11, 8), constrained_layout=True)
    axes_flat = axes.ravel()
    if metric_df.empty:
        for ax in axes_flat:
            ax.axis("off")
        return fig

    plots = [
        ("average_energy", "Average energy"),
        ("alive_agents", "Alive agents"),
        ("total_biomass", "Total biomass"),
        ("remaining_food_calories", "Remaining food"),
        ("consumed_food_calories", "Consumed food"),
        ("trail_coverage", "Trail coverage"),
        ("network_weighted_cost", "Network cost"),
        ("network_efficiency", "Network efficiency"),
        ("shortest_path_length", "Shortest path length"),
    ]
    x = metric_df["step"] if "step" in metric_df else np.arange(len(metric_df))
    for ax, (column, title) in zip(axes_flat, plots):
        if column in metric_df:
            ax.plot(x, metric_df[column], color="#2563eb", linewidth=1.8)
        ax.set_title(title, fontsize=10)
        ax.set_xlabel("step", fontsize=8)
        ax.tick_params(labelsize=8)
        ax.grid(True, alpha=0.24)
    return fig
