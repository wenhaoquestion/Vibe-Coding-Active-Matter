"""Fast artistic renderers for live Physarum animation frames."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import matplotlib.pyplot as plt
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy.ndimage import binary_dilation, binary_erosion, gaussian_filter


EPS = 1.0e-9


@dataclass
class VisualParams:
    visual_mode: str = "petri_dish"
    output_width_px: int = 900
    output_height_px: int = 600
    upscale_factor: int = 6

    agar_base_blue: tuple[int, int, int] = (20, 55, 95)
    agar_highlight_blue: tuple[int, int, int] = (70, 130, 180)
    wall_color: tuple[int, int, int] = (10, 15, 25)

    slime_low_color: tuple[int, int, int] = (80, 160, 55)
    slime_mid_color: tuple[int, int, int] = (150, 210, 55)
    slime_high_color: tuple[int, int, int] = (240, 230, 70)
    slime_glow_color: tuple[int, int, int] = (180, 240, 70)

    food_core_color: tuple[int, int, int] = (255, 230, 90)
    food_glow_color: tuple[int, int, int] = (255, 160, 20)

    trail_gamma: float = 0.45
    trail_alpha_scale: float = 1.8
    glow_sigma: float = 2.5
    core_sigma: float = 0.6
    high_trail_percentile: float = 92.0

    show_agents_in_art_mode: bool = False
    show_network_in_art_mode: bool = True
    show_shortest_path_in_art_mode: bool = True
    show_food_labels_in_art_mode: bool = False

    dish_border_thickness: int = 8
    dish_corner_radius: int = 24
    agar_noise_strength: float = 0.05

    fps: int = 20
    sim_steps_per_frame: int = 1
    frames_per_live_batch: int = 200

    show_hud: bool = True


_BACKGROUND_CACHE: dict[tuple[Any, ...], np.ndarray] = {}
_MASK_CACHE: dict[tuple[int, int, int, int], np.ndarray] = {}


def make_agar_background(shape: tuple[int, int], visual_params: VisualParams) -> np.ndarray:
    """Create a deterministic blue agar plate background."""

    height, width = shape
    key = (
        height,
        width,
        visual_params.agar_base_blue,
        visual_params.agar_highlight_blue,
        round(float(visual_params.agar_noise_strength), 4),
    )
    cached = _BACKGROUND_CACHE.get(key)
    if cached is not None:
        return cached.copy()

    yy, xx = np.mgrid[0:height, 0:width]
    x = xx / max(width - 1, 1)
    y = yy / max(height - 1, 1)
    base = np.array(visual_params.agar_base_blue, dtype=float)
    highlight = np.array(visual_params.agar_highlight_blue, dtype=float)

    radial = 1.0 - np.sqrt((x - 0.42) ** 2 + (y - 0.38) ** 2) / 0.74
    radial = np.clip(radial, 0.0, 1.0)
    top_sheen = np.clip(1.0 - (0.70 * x + 1.25 * y), 0.0, 1.0)
    edge_dark = np.clip(np.minimum.reduce([x, y, 1.0 - x, 1.0 - y]) / 0.16, 0.0, 1.0)

    rng = np.random.default_rng(173)
    noise = gaussian_filter(rng.normal(0.0, 1.0, size=(height, width)), sigma=3.0)
    noise = noise / (np.std(noise) + EPS)

    image = base[None, None, :]
    image = image + radial[..., None] * (highlight - base)[None, None, :] * 0.48
    image = image + top_sheen[..., None] * np.array([18.0, 28.0, 34.0])
    image = image * (0.72 + 0.28 * edge_dark[..., None])
    image = image + noise[..., None] * 255.0 * visual_params.agar_noise_strength
    image = np.clip(image, 0, 255).astype(np.uint8)
    _BACKGROUND_CACHE[key] = image.copy()
    return image


def make_petri_dish_mask(shape: tuple[int, int], visual_params: VisualParams) -> np.ndarray:
    """Return a rounded-rectangle mask for the visible petri dish area."""

    height, width = shape
    key = (height, width, int(visual_params.dish_corner_radius), int(visual_params.dish_border_thickness))
    cached = _MASK_CACHE.get(key)
    if cached is not None:
        return cached.copy()

    margin = max(visual_params.dish_border_thickness + 2, 10)
    radius = max(visual_params.dish_corner_radius, 4)
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle(
        (margin, margin, width - margin - 1, height - margin - 1),
        radius=radius,
        fill=255,
    )
    result = np.asarray(mask, dtype=np.uint8) > 0
    _MASK_CACHE[key] = result.copy()
    return result


def render_trail_glow(
    image: np.ndarray,
    trail: np.ndarray,
    prev_trail: np.ndarray | None,
    visual_params: VisualParams,
    visible_mask: np.ndarray | None = None,
) -> np.ndarray:
    """Blend trail field into a yellow-green glowing vein network."""

    height, width = image.shape[:2]
    trail = np.nan_to_num(trail, copy=False)
    positive = trail[trail > EPS]
    if positive.size == 0:
        return image

    denom = max(float(np.percentile(positive, 99.0)), EPS)
    normalized = np.clip(trail / denom, 0.0, 4.0)
    trail_alpha = np.clip(
        normalized ** max(visual_params.trail_gamma, EPS) * visual_params.trail_alpha_scale,
        0.0,
        1.0,
    )
    glow = gaussian_filter(trail_alpha, sigma=max(visual_params.glow_sigma, 0.1))

    high_threshold = float(np.percentile(positive, visual_params.high_trail_percentile))
    high_mask = (trail > high_threshold).astype(float)
    core = gaussian_filter(high_mask, sigma=max(visual_params.core_sigma, 0.1))

    if prev_trail is None or prev_trail.shape != trail.shape:
        new_growth = np.zeros_like(trail)
    else:
        new_growth = np.maximum(trail - np.nan_to_num(prev_trail, copy=False), 0.0)
    if np.any(new_growth > EPS):
        growth_den = max(float(np.percentile(new_growth[new_growth > EPS], 98.0)), EPS)
        growth_alpha = np.clip((new_growth / growth_den) ** 0.38, 0.0, 1.0)
        growth_alpha = gaussian_filter(growth_alpha, sigma=0.45)
    else:
        growth_alpha = np.zeros_like(trail)

    glow_hr = _resize_scalar(glow, width, height)
    alpha_hr = _resize_scalar(trail_alpha, width, height)
    core_hr = _resize_scalar(core, width, height)
    growth_hr = _resize_scalar(growth_alpha, width, height)

    if visible_mask is not None:
        mask = visible_mask.astype(float)
        glow_hr *= mask
        alpha_hr *= mask
        core_hr *= mask
        growth_hr *= mask

    work = image.astype(np.float32)
    _blend_rgb_inplace(work, visual_params.slime_glow_color, np.clip(glow_hr * 0.72, 0.0, 0.62))
    _blend_rgb_inplace(work, visual_params.slime_low_color, np.clip(alpha_hr * 0.34, 0.0, 0.50))
    _blend_rgb_inplace(work, visual_params.slime_mid_color, np.clip(alpha_hr * 0.66, 0.0, 0.74))
    _blend_rgb_inplace(work, visual_params.slime_high_color, np.clip(core_hr * 0.98, 0.0, 0.95))
    _blend_rgb_inplace(work, visual_params.slime_glow_color, np.clip(growth_hr * 0.86, 0.0, 0.90))
    _blend_rgb_inplace(work, visual_params.slime_high_color, np.clip(growth_hr * 0.34, 0.0, 0.62))
    return np.clip(work, 0, 255).astype(np.uint8)


def render_food_blobs(
    image: np.ndarray,
    sim: Any,
    visual_params: VisualParams,
    show_labels: bool = False,
) -> np.ndarray:
    """Draw food sources as shrinking yellow-orange nutrient blobs."""

    pil = Image.fromarray(image).convert("RGBA")
    width, height = pil.size
    sx = width / max(sim.params.W, 1)
    sy = height / max(sim.params.H, 1)
    scale = min(sx, sy)

    glow = Image.new("RGBA", pil.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    core = Image.new("RGBA", pil.size, (0, 0, 0, 0))
    core_draw = ImageDraw.Draw(core)

    for idx, food in enumerate(sim.food_sources):
        initial = max(float(getattr(food, "initial_calories", food.calories)), EPS)
        ratio = np.clip(float(food.calories) / initial, 0.0, 1.0)
        if ratio <= 0.002:
            dim = 0.22
        else:
            dim = 0.45 + 0.55 * np.sqrt(ratio)
        radius_grid = max(0.6, float(getattr(food, "radius", sim.params.default_food_radius)))
        radius = max(3.0, (2.0 + radius_grid * (0.70 + np.sqrt(ratio))) * scale)
        glow_radius = radius * (2.0 + 0.45 * ratio)
        x, y = _world_to_pixel(food.x, food.y, sim.params.W, sim.params.H, width, height)
        glow_color = (*visual_params.food_glow_color, int(112 * dim))
        core_color = (*visual_params.food_core_color, int(245 * dim))
        edge_color = (255, 245, 185, int(210 * dim))

        glow_draw.ellipse((x - glow_radius, y - glow_radius, x + glow_radius, y + glow_radius), fill=glow_color)
        core_draw.ellipse((x - radius, y - radius * 0.82, x + radius, y + radius * 0.92), fill=core_color, outline=edge_color, width=1)

        rng = np.random.default_rng(10_000 + idx * 97)
        for _ in range(7):
            angle = rng.uniform(0.0, 2.0 * np.pi)
            rr = rng.uniform(radius * 0.15, radius * 0.92)
            px = x + np.cos(angle) * rr
            py = y + np.sin(angle) * rr * 0.78
            speck_r = rng.uniform(0.45, 1.4) * max(1.0, scale * 0.35)
            speck = (255, int(rng.uniform(180, 230)), int(rng.uniform(55, 120)), int(105 * dim))
            core_draw.ellipse((px - speck_r, py - speck_r, px + speck_r, py + speck_r), fill=speck)

        if show_labels:
            _draw_text(core_draw, (x + radius + 4, y - radius), f"F{idx} {food.calories:.0f}", fill=(255, 250, 210, 225))

    glow = glow.filter(ImageFilter.GaussianBlur(radius=8))
    pil = Image.alpha_composite(pil, glow)
    pil = Image.alpha_composite(pil, core)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def render_agents_overlay(
    image: np.ndarray,
    sim: Any,
    visual_params: VisualParams,
    *,
    max_agents: int = 1400,
    alpha: int = 175,
    sensor_vectors: bool = False,
) -> np.ndarray:
    """Draw agent dots and optional sensor vectors."""

    if len(sim.positions) == 0 or not np.any(sim.alive):
        return image
    pil = Image.fromarray(image).convert("RGBA")
    draw = ImageDraw.Draw(pil, "RGBA")
    width, height = pil.size
    alive_idx = np.flatnonzero(sim.alive)
    if alive_idx.size > max_agents:
        rng = np.random.default_rng(811 + int(sim.step_count))
        alive_idx = rng.choice(alive_idx, size=max_agents, replace=False)

    for idx in alive_idx:
        x, y = _world_to_pixel(sim.positions[idx, 0], sim.positions[idx, 1], sim.params.W, sim.params.H, width, height)
        mode = int(sim.modes[idx])
        color = (240, 255, 225, alpha) if mode == 0 else (255, 180, 115, alpha)
        if mode == 2:
            color = (180, 196, 204, max(70, alpha // 2))
        r = 1.6 if visual_params.visual_mode != "scientific" else 2.4
        draw.ellipse((x - r, y - r, x + r, y + r), fill=color)

    if sensor_vectors:
        subset = alive_idx[: min(80, alive_idx.size)]
        sd = float(sim.params.sensor_distance)
        for idx in subset:
            x0, y0 = _world_to_pixel(sim.positions[idx, 0], sim.positions[idx, 1], sim.params.W, sim.params.H, width, height)
            hx = sim.positions[idx, 0] + np.cos(sim.headings[idx]) * sd
            hy = sim.positions[idx, 1] + np.sin(sim.headings[idx]) * sd
            x1, y1 = _world_to_pixel(hx, hy, sim.params.W, sim.params.H, width, height)
            draw.line((x0, y0, x1, y1), fill=(130, 220, 255, 110), width=1)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def render_obstacles_maze(image: np.ndarray, obstacle_mask: np.ndarray, visual_params: VisualParams) -> np.ndarray:
    """Render obstacle cells as raised dark maze walls over blue corridors."""

    if obstacle_mask.size == 0 or not np.any(obstacle_mask):
        return image
    height, width = image.shape[:2]
    wall = _resize_mask(obstacle_mask, width, height)
    boundary = binary_dilation(obstacle_mask, iterations=1) ^ binary_erosion(obstacle_mask, iterations=1)
    boundary_hr = _resize_mask(boundary, width, height)

    shaded = image.copy()
    shaded[wall] = np.array(visual_params.wall_color, dtype=np.uint8)
    shaded = _blend_rgb(shaded, (32, 80, 120), boundary_hr.astype(float) * 0.34)

    yy, xx = np.mgrid[0:height, 0:width]
    sheen = np.clip(1.0 - (0.55 * xx / max(width, 1) + yy / max(height, 1)), 0.0, 1.0)
    corridor = ~wall
    shaded[corridor] = np.clip(
        shaded[corridor].astype(float) + sheen[corridor, None] * np.array([6.0, 14.0, 20.0]),
        0,
        255,
    ).astype(np.uint8)
    return shaded


def render_network_biological(
    image: np.ndarray,
    sim: Any,
    visual_params: VisualParams,
    *,
    shortest_path: bool = True,
    debug: bool = False,
) -> np.ndarray:
    """Draw conductance-weighted biological tubes and optional shortest path."""

    solver = getattr(sim, "network_solver", None)
    if solver is None:
        return image
    edges = solver.get_edges_for_plot()
    if not edges:
        return image

    pil = Image.fromarray(image).convert("RGBA")
    tube_layer = Image.new("RGBA", pil.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(tube_layer, "RGBA")
    width, height = pil.size

    conductances = np.array([edge["conductance"] for edge in edges], dtype=float)
    d_min = float(np.min(conductances))
    d_max = float(np.max(conductances))
    threshold = float(getattr(solver.params, "D_vis", 0.0))

    for edge in edges:
        d = float(edge["conductance"])
        ratio = np.clip((d - d_min) / (d_max - d_min + EPS), 0.0, 1.0)
        if not debug and d < threshold:
            alpha = int(38 + 58 * ratio)
            line_width = max(1, int(round(1.0 + 1.6 * ratio)))
            color = (*visual_params.slime_low_color, alpha)
        else:
            alpha = int(90 + 132 * ratio)
            line_width = max(1, int(round(1.4 + 7.0 * ratio)))
            color = (*visual_params.slime_high_color, alpha)
        x0, y0 = _world_to_pixel(edge["x0"], edge["y0"], sim.params.W, sim.params.H, width, height)
        x1, y1 = _world_to_pixel(edge["x1"], edge["y1"], sim.params.W, sim.params.H, width, height)
        draw.line((x0, y0, x1, y1), fill=color, width=line_width, joint="curve")

    tube_layer = tube_layer.filter(ImageFilter.GaussianBlur(radius=0.45))
    pil = Image.alpha_composite(pil, tube_layer)

    if shortest_path:
        path = solver.get_primary_path()
        if len(path) >= 2:
            path_layer = Image.new("RGBA", pil.size, (0, 0, 0, 0))
            path_draw = ImageDraw.Draw(path_layer, "RGBA")
            points = [_world_to_pixel(x, y, sim.params.W, sim.params.H, width, height) for x, y in path]
            color = (255, 250, 145, 225) if not debug else (255, 95, 55, 235)
            for p0, p1 in zip(points[:-1], points[1:]):
                _draw_dashed_line(path_draw, p0, p1, fill=color, width=3 if debug else 4, dash=11, gap=7)
            pil = Image.alpha_composite(pil, path_layer)

    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def render_frame(sim: Any, visual_params: VisualParams, scientific_overlay: bool = False) -> np.ndarray:
    """Render a simulation frame as an RGB uint8 image."""

    if visual_params.visual_mode == "scientific":
        return _render_scientific_frame(sim, visual_params, scientific_overlay=True)

    target_height = int(visual_params.output_height_px)
    target_width = int(visual_params.output_width_px)
    width = int(min(target_width, max(sim.params.W, sim.params.W * visual_params.upscale_factor)))
    height = int(min(target_height, max(sim.params.H, sim.params.H * visual_params.upscale_factor)))
    image = make_agar_background((height, width), visual_params)

    dish_mask: np.ndarray | None = None
    if visual_params.visual_mode == "maze":
        image = render_obstacles_maze(image, sim.obstacle_mask, visual_params)
        visible_mask = None
    else:
        dish_mask = make_petri_dish_mask((height, width), visual_params)
        outside = np.array([3, 6, 12], dtype=np.uint8)
        image[~dish_mask] = outside
        visible_mask = dish_mask
        if np.any(sim.obstacle_mask):
            image = render_obstacles_maze(image, sim.obstacle_mask, visual_params)
            image[~dish_mask] = outside

    image = render_trail_glow(image, sim.trail, getattr(sim, "prev_trail", None), visual_params, visible_mask=visible_mask)

    if visual_params.show_network_in_art_mode or scientific_overlay:
        image = render_network_biological(
            image,
            sim,
            visual_params,
            shortest_path=visual_params.show_shortest_path_in_art_mode or scientific_overlay,
            debug=scientific_overlay,
        )

    image = render_food_blobs(
        image,
        sim,
        visual_params,
        show_labels=visual_params.show_food_labels_in_art_mode or scientific_overlay,
    )

    if visual_params.show_agents_in_art_mode or scientific_overlay:
        image = render_agents_overlay(
            image,
            sim,
            visual_params,
            alpha=185 if scientific_overlay else 105,
            sensor_vectors=scientific_overlay,
        )

    if dish_mask is not None:
        image = _draw_petri_border(image, visual_params)
    else:
        image = _draw_maze_frame(image)

    if visual_params.show_hud:
        image = _draw_hud(image, sim)
    if scientific_overlay and visual_params.visual_mode != "scientific":
        image = _draw_coordinate_overlay(image, sim)
    if (width, height) != (target_width, target_height):
        image = np.asarray(
            Image.fromarray(image).resize((target_width, target_height), Image.Resampling.BILINEAR),
            dtype=np.uint8,
        )
    return np.asarray(image, dtype=np.uint8)


def _render_scientific_frame(sim: Any, visual_params: VisualParams, scientific_overlay: bool) -> np.ndarray:
    width = int(visual_params.output_width_px)
    height = int(visual_params.output_height_px)
    dpi = 100
    fig, ax = plt.subplots(figsize=(width / dpi, height / dpi), dpi=dpi, constrained_layout=True)
    vmax = float(np.percentile(sim.trail, 99.5)) if np.any(sim.trail) else 1.0
    vmax = max(vmax, EPS)
    image = ax.imshow(sim.trail, origin="lower", extent=[0, sim.params.W, 0, sim.params.H], cmap="viridis", vmin=0, vmax=vmax)
    fig.colorbar(image, ax=ax, fraction=0.036, pad=0.02, label="trail")

    if np.any(sim.obstacle_mask):
        mask = np.ma.masked_where(~sim.obstacle_mask, sim.obstacle_mask)
        ax.imshow(mask, origin="lower", extent=[0, sim.params.W, 0, sim.params.H], cmap="gray_r", alpha=0.70, interpolation="nearest")

    if getattr(sim, "network_solver", None) is not None:
        for edge in sim.network_solver.get_edges_for_plot():
            ax.plot([edge["x0"], edge["x1"]], [edge["y0"], edge["y1"]], color="#f97316", alpha=0.45, linewidth=1.2)
        path = sim.network_solver.get_primary_path()
        if len(path) >= 2:
            xs, ys = zip(*path)
            ax.plot(xs, ys, color="#ef4444", linestyle="--", linewidth=2.0)

    for idx, food in enumerate(sim.food_sources):
        radius = max(0.6, getattr(food, "radius", sim.params.default_food_radius))
        circ = plt.Circle((food.x, food.y), radius=radius, facecolor="#ffd166", edgecolor="#f97316", linewidth=1.2, alpha=0.88)
        ax.add_patch(circ)
        ax.text(food.x + radius + 0.4, food.y + radius + 0.4, f"F{idx}: {food.calories:.0f}", fontsize=7, color="white")

    if len(sim.positions) and np.any(sim.alive):
        pos = sim.positions[sim.alive]
        ax.scatter(pos[:, 0], pos[:, 1], s=visual_params.upscale_factor, c="#f8fafc", edgecolors="#0f172a", linewidths=0.15, alpha=0.75)
        if scientific_overlay:
            subset = np.flatnonzero(sim.alive)[: min(60, int(np.sum(sim.alive)))]
            for idx in subset:
                x0, y0 = sim.positions[idx]
                x1 = x0 + np.cos(sim.headings[idx]) * sim.params.sensor_distance
                y1 = y0 + np.sin(sim.headings[idx]) * sim.params.sensor_distance
                ax.plot([x0, x1], [y0, y1], color="#93c5fd", alpha=0.45, linewidth=0.8)

    ax.set_xlim(0, sim.params.W)
    ax.set_ylim(0, sim.params.H)
    ax.set_aspect("equal", adjustable="box")
    ax.set_title(f"Scientific debug view - step {sim.step_count}")
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.grid(alpha=0.18)
    fig.canvas.draw()
    rgba = np.asarray(fig.canvas.buffer_rgba())
    frame = rgba[:, :, :3].copy()
    plt.close(fig)
    return frame


def _resize_scalar(field: np.ndarray, width: int, height: int) -> np.ndarray:
    arr = np.clip(np.flipud(np.asarray(field, dtype=np.float32)), 0.0, 1.0)
    im = Image.fromarray((arr * 255.0).astype(np.uint8), mode="L").resize((width, height), Image.Resampling.BILINEAR)
    return np.asarray(im, dtype=np.float32) / 255.0


def _resize_mask(mask: np.ndarray, width: int, height: int) -> np.ndarray:
    arr = (np.flipud(np.asarray(mask, dtype=np.uint8)) * 255)
    im = Image.fromarray(arr, mode="L").resize((width, height), Image.Resampling.NEAREST)
    return np.asarray(im, dtype=np.uint8) > 127


def _blend_rgb(image: np.ndarray, color: tuple[int, int, int], alpha: np.ndarray | float) -> np.ndarray:
    src = image.astype(np.float32)
    a = np.asarray(alpha, dtype=np.float32)
    if a.ndim == 0:
        a = np.full(image.shape[:2], float(a))
    a = np.clip(a, 0.0, 1.0)[..., None]
    out = src * (1.0 - a) + np.array(color, dtype=np.float32)[None, None, :] * a
    return np.clip(out, 0, 255).astype(np.uint8)


def _blend_rgb_inplace(image: np.ndarray, color: tuple[int, int, int], alpha: np.ndarray | float) -> None:
    a = np.asarray(alpha, dtype=np.float32)
    if a.ndim == 0:
        a = np.full(image.shape[:2], float(a), dtype=np.float32)
    a = np.clip(a, 0.0, 1.0)[..., None]
    image *= 1.0 - a
    image += np.array(color, dtype=np.float32)[None, None, :] * a


def _world_to_pixel(x: float, y: float, world_w: int, world_h: int, width: int, height: int) -> tuple[float, float]:
    px = np.clip(float(x) / max(world_w, 1) * width, 0.0, width - 1.0)
    py = np.clip(height - float(y) / max(world_h, 1) * height, 0.0, height - 1.0)
    return float(px), float(py)


def _draw_petri_border(image: np.ndarray, visual_params: VisualParams) -> np.ndarray:
    pil = Image.fromarray(image).convert("RGBA")
    draw = ImageDraw.Draw(pil, "RGBA")
    width, height = pil.size
    margin = max(visual_params.dish_border_thickness + 2, 10)
    radius = max(visual_params.dish_corner_radius, 4)
    rect = (margin, margin, width - margin - 1, height - margin - 1)
    draw.rounded_rectangle(rect, radius=radius, outline=(170, 225, 255, 105), width=visual_params.dish_border_thickness)
    inner = tuple(v + visual_params.dish_border_thickness + 2 for v in rect[:2]) + tuple(
        v - visual_params.dish_border_thickness - 2 for v in rect[2:]
    )
    draw.rounded_rectangle(inner, radius=max(1, radius - visual_params.dish_border_thickness), outline=(235, 255, 255, 54), width=2)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def _draw_maze_frame(image: np.ndarray) -> np.ndarray:
    pil = Image.fromarray(image).convert("RGBA")
    draw = ImageDraw.Draw(pil, "RGBA")
    width, height = pil.size
    draw.rectangle((4, 4, width - 5, height - 5), outline=(118, 190, 225, 95), width=4)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def _draw_hud(image: np.ndarray, sim: Any) -> np.ndarray:
    metrics = sim.get_metrics()
    lines = [
        f"step {int(metrics.get('step', sim.step_count))}",
        f"alive {int(metrics.get('alive_agents', 0))}",
        f"food {metrics.get('remaining_food_calories', 0.0):.0f}",
        f"avg E {metrics.get('average_energy', 0.0):.1f}",
    ]
    pil = Image.fromarray(image).convert("RGBA")
    draw = ImageDraw.Draw(pil, "RGBA")
    font = _font(13)
    padding = 8
    line_h = 16
    width = max(int(draw.textlength(line, font=font)) for line in lines) + padding * 2
    height = line_h * len(lines) + padding * 2
    draw.rounded_rectangle((16, 16, 16 + width, 16 + height), radius=7, fill=(4, 10, 18, 138), outline=(210, 240, 230, 55), width=1)
    for i, line in enumerate(lines):
        draw.text((16 + padding, 16 + padding + i * line_h), line, fill=(244, 255, 226, 230), font=font)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def _draw_coordinate_overlay(image: np.ndarray, sim: Any) -> np.ndarray:
    pil = Image.fromarray(image).convert("RGBA")
    draw = ImageDraw.Draw(pil, "RGBA")
    width, height = pil.size
    font = _font(11)
    for x in np.linspace(0, sim.params.W, 7):
        px, _ = _world_to_pixel(x, 0, sim.params.W, sim.params.H, width, height)
        draw.line((px, height - 12, px, height - 4), fill=(210, 230, 255, 115), width=1)
        draw.text((px + 2, height - 24), f"{x:.0f}", fill=(210, 230, 255, 150), font=font)
    for y in np.linspace(0, sim.params.H, 5):
        _, py = _world_to_pixel(0, y, sim.params.W, sim.params.H, width, height)
        draw.line((4, py, 12, py), fill=(210, 230, 255, 115), width=1)
        draw.text((16, py - 7), f"{y:.0f}", fill=(210, 230, 255, 150), font=font)
    return np.asarray(pil.convert("RGB"), dtype=np.uint8)


def _draw_text(draw: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, fill: tuple[int, int, int, int]) -> None:
    font = _font(12)
    x, y = xy
    bbox = draw.textbbox((x, y), text, font=font)
    draw.rounded_rectangle((bbox[0] - 3, bbox[1] - 2, bbox[2] + 3, bbox[3] + 2), radius=3, fill=(4, 9, 14, 132))
    draw.text((x, y), text, fill=fill, font=font)


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("Arial.ttf", size)
    except Exception:
        return ImageFont.load_default()


def _draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    p0: tuple[float, float],
    p1: tuple[float, float],
    *,
    fill: tuple[int, int, int, int],
    width: int,
    dash: float,
    gap: float,
) -> None:
    x0, y0 = p0
    x1, y1 = p1
    length = float(np.hypot(x1 - x0, y1 - y0))
    if length <= EPS:
        return
    direction = np.array([(x1 - x0) / length, (y1 - y0) / length])
    pos = 0.0
    while pos < length:
        end = min(pos + dash, length)
        start_pt = np.array([x0, y0]) + direction * pos
        end_pt = np.array([x0, y0]) + direction * end
        draw.line((tuple(start_pt), tuple(end_pt)), fill=fill, width=width)
        pos += dash + gap
