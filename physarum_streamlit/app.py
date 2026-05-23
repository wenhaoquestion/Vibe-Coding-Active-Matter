"""Streamlit front end for the interactive Physarum simulator."""

from __future__ import annotations

from dataclasses import asdict, fields, is_dataclass, replace
from io import BytesIO
from pathlib import Path
import time
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
from PIL import Image
import streamlit as st

from animation import AnimationController, HAS_AUTOREFRESH, maybe_autorefresh, run_live_batch
from formulas import get_bibtex, get_key_equations, get_latex_document
from presets import EXPERIMENT_PRESETS, WORLD_PRESETS, apply_experiment_preset, apply_world_preset
from simulation import PhysarumSimulation, SimParams
from visual_style import VisualParams, render_frame
from visualization import plot_metric_history, plot_simulation


ROOT = Path(__file__).resolve().parent


st.set_page_config(
    page_title="Interactive Physarum Slime Mold Simulator",
    page_icon="P",
    layout="wide",
)


def initialize_state() -> None:
    if "params" not in st.session_state:
        st.session_state.params = SimParams()
    else:
        st.session_state.params = coerce_params(st.session_state.params)
    if "visual_params" not in st.session_state:
        st.session_state.visual_params = VisualParams()
    else:
        st.session_state.visual_params = coerce_visual_params(st.session_state.visual_params)
    if "sim" not in st.session_state or not isinstance(st.session_state.sim, PhysarumSimulation):
        st.session_state.sim = PhysarumSimulation(st.session_state.params)
    if "metrics_history" not in st.session_state:
        st.session_state.metrics_history = [st.session_state.sim.get_metrics()]
    if "play_enabled" not in st.session_state:
        st.session_state.play_enabled = False
    if "last_perf" not in st.session_state:
        st.session_state.last_perf = {
            "measured_fps": 0.0,
            "last_frame_render_ms": 0.0,
            "last_simulation_step_ms": 0.0,
        }
    if "gif_bytes" not in st.session_state:
        st.session_state.gif_bytes = None
    if "initialized" not in st.session_state:
        st.session_state.initialized = True
    if "editor_x" not in st.session_state:
        st.session_state.editor_x = st.session_state.params.W / 2.0
    if "editor_y" not in st.session_state:
        st.session_state.editor_y = st.session_state.params.H / 2.0
    if "selected_editor_mode" not in st.session_state:
        st.session_state.selected_editor_mode = "Add food"


def coerce_params(value: Any) -> SimParams:
    """Keep hot-reloaded sessions compatible when new parameters are added."""

    defaults = SimParams()
    if is_dataclass(value):
        data = asdict(value)
    else:
        data = dict(value) if isinstance(value, dict) else {}
    return SimParams(**{field.name: data.get(field.name, getattr(defaults, field.name)) for field in fields(SimParams)})


def coerce_visual_params(value: Any) -> VisualParams:
    """Keep visual options compatible during hot reloads."""

    defaults = VisualParams()
    if is_dataclass(value):
        data = asdict(value)
    else:
        data = dict(value) if isinstance(value, dict) else {}
    return VisualParams(**{field.name: data.get(field.name, getattr(defaults, field.name)) for field in fields(VisualParams)})


def render_controls_panel(params: SimParams) -> tuple[SimParams, dict[str, Any]]:
    """Render detailed simulation controls and return updated parameters plus actions."""

    p = replace(params)
    st.header("Simulation Controls")
    st.caption("World size, seed, initial counts, and patch initialization take effect when you reset.")

    with st.expander("World", expanded=True):
        p.W = st.number_input("W", min_value=30, max_value=400, value=int(p.W), step=10)
        p.H = st.number_input("H", min_value=30, max_value=300, value=int(p.H), step=10)
        p.boundary_mode = st.selectbox("boundary_mode", ["bounce", "wrap"], index=["bounce", "wrap"].index(p.boundary_mode))
        p.random_seed = st.number_input("random_seed", min_value=0, max_value=2**31 - 1, value=int(p.random_seed), step=1)
        reset_world = st.button("Reset", key="controls_reset_world")

    with st.expander("Agents", expanded=False):
        p.initial_agents = st.number_input("initial_agents", min_value=0, max_value=20000, value=int(p.initial_agents), step=100)
        p.max_agents = st.number_input("max_agents", min_value=1, max_value=50000, value=int(p.max_agents), step=100)
        init_modes = ["random", "central_patch", "edge_patch", "around_food", "manual_patch"]
        p.agent_init_mode = st.selectbox(
            "agent_init_mode",
            init_modes,
            index=init_modes.index(p.agent_init_mode) if p.agent_init_mode in init_modes else init_modes.index("edge_patch"),
        )
        p.patch_center_x = st.number_input("patch_center_x", min_value=0.0, max_value=float(p.W), value=float(p.patch_center_x), step=1.0)
        p.patch_center_y = st.number_input("patch_center_y", min_value=0.0, max_value=float(p.H), value=float(p.patch_center_y), step=1.0)
        p.patch_sigma = st.number_input("patch_sigma", min_value=0.1, value=float(p.patch_sigma), step=0.5)
        p.initial_energy = st.number_input("initial_energy", min_value=0.0, value=float(p.initial_energy), step=5.0)
        p.E_max = st.number_input("E_max", min_value=1.0, value=float(p.E_max), step=5.0)
        p.initial_mass = st.number_input("initial_mass", min_value=0.01, value=float(p.initial_mass), step=0.1)
        p.death_policy = st.selectbox("death_policy", ["remove", "dormant"], index=["remove", "dormant"].index(p.death_policy))
        p.death_energy = st.number_input("death_energy", min_value=0.0, value=float(p.death_energy), step=0.5)

    with st.expander("Movement and sensing", expanded=False):
        p.move_distance = st.number_input("move_distance", min_value=0.0, value=float(p.move_distance), step=0.1)
        p.min_speed = st.number_input("min_speed", min_value=0.0, value=float(p.min_speed), step=0.1)
        p.sensor_distance = st.number_input("sensor_distance", min_value=0.0, value=float(p.sensor_distance), step=0.5)
        p.sensor_angle = st.number_input("sensor_angle", min_value=0.0, max_value=3.14, value=float(p.sensor_angle), step=0.05)
        p.rotation_angle = st.number_input("rotation_angle", min_value=0.0, max_value=3.14, value=float(p.rotation_angle), step=0.05)
        p.random_turn_sigma = st.number_input("random_turn_sigma", min_value=0.0, value=float(p.random_turn_sigma), step=0.05)
        p.w_trail = st.number_input("w_trail", min_value=0.0, value=float(p.w_trail), step=0.1)
        p.w_food = st.number_input("w_food", min_value=0.0, value=float(p.w_food), step=0.1)
        p.w_obstacle = st.number_input("w_obstacle", min_value=0.0, value=float(p.w_obstacle), step=100.0)

    with st.expander("Trail", expanded=False):
        p.trail_deposit_base = st.number_input("trail_deposit_base q0", min_value=0.0, value=float(p.trail_deposit_base), step=0.1)
        p.trail_decay = st.slider("trail_decay lambda_T", min_value=0.0, max_value=1.0, value=float(p.trail_decay), step=0.01)
        p.trail_diffusion = st.number_input("trail_diffusion sigma_T", min_value=0.0, value=float(p.trail_diffusion), step=0.1)
        p.trail_cost = st.number_input("trail_cost c_trail", min_value=0.0, value=float(p.trail_cost), step=0.001, format="%.4f")
        p.trail_coverage_threshold = st.number_input("trail coverage threshold", min_value=0.0, value=float(p.trail_coverage_threshold), step=0.01)

    with st.expander("Food", expanded=False):
        p.initial_food_count = st.number_input("initial_food_count", min_value=0, max_value=200, value=int(p.initial_food_count), step=1)
        p.default_food_calories = st.number_input("default_food_calories", min_value=0.0, value=float(p.default_food_calories), step=50.0)
        p.default_food_radius = st.number_input("default_food_radius / size", min_value=0.1, value=float(p.default_food_radius), step=0.5)
        p.eat_radius = st.number_input("eat_radius", min_value=0.0, value=float(p.eat_radius), step=0.1)
        p.bite_rate = st.number_input("bite_rate", min_value=0.0, value=float(p.bite_rate), step=0.1)
        p.food_efficiency = st.number_input("food_efficiency eta_food", min_value=0.0, value=float(p.food_efficiency), step=0.1)
        p.sigma_food = st.number_input("sigma_food", min_value=0.1, value=float(p.sigma_food), step=0.5)
        p.C_half = st.number_input("C_half", min_value=0.0, value=float(p.C_half), step=10.0)

    with st.expander("Energy", expanded=False):
        p.c_base = st.number_input("c_base", min_value=0.0, value=float(p.c_base), step=0.01)
        p.c_move = st.number_input("c_move", min_value=0.0, value=float(p.c_move), step=0.01)
        p.c_dormant = st.number_input("c_dormant", min_value=0.0, value=float(p.c_dormant), step=0.001, format="%.4f")
        p.c_growth = st.number_input("c_growth", min_value=0.0, value=float(p.c_growth), step=0.1)

    with st.expander("Growth/division", expanded=False):
        p.growth_rate = st.number_input("growth_rate r_g", min_value=0.0, value=float(p.growth_rate), step=0.005, format="%.4f")
        p.growth_threshold = st.slider("growth_threshold theta_g", min_value=0.0, max_value=1.0, value=float(p.growth_threshold), step=0.01)
        p.split_energy = st.number_input("split_energy", min_value=0.0, value=float(p.split_energy), step=5.0)
        p.split_position_sigma = st.number_input("split_position_sigma", min_value=0.0, value=float(p.split_position_sigma), step=0.1)

    with st.expander("Search/exploit", expanded=False):
        p.k_E = st.number_input("k_E", min_value=0.0, value=float(p.k_E), step=0.5)
        p.theta_E = st.slider("theta_E", min_value=0.0, max_value=1.0, value=float(p.theta_E), step=0.01)
        p.k_S = st.number_input("k_S", min_value=0.0, value=float(p.k_S), step=0.5)
        p.search_threshold = st.number_input("search_threshold", value=float(p.search_threshold), step=0.05)
        p.theta_dormant = st.slider("theta_dormant", min_value=0.0, max_value=1.0, value=float(p.theta_dormant), step=0.01)
        p.keep_searching_without_food = st.checkbox(
            "keep_searching_without_food",
            value=bool(p.keep_searching_without_food),
        )

    with st.expander("Network", expanded=False):
        p.enable_network = st.checkbox("enable_network", value=bool(p.enable_network))
        p.network_update_every = st.number_input("network_update_every", min_value=1, value=int(p.network_update_every), step=1)
        p.graph_k_neighbors = st.number_input("graph_k_neighbors", min_value=1, max_value=20, value=int(p.graph_k_neighbors), step=1)
        p.include_trail_landmarks = st.checkbox("include_trail_landmarks", value=bool(p.include_trail_landmarks))
        p.max_trail_landmarks = st.number_input("max_trail_landmarks", min_value=0, max_value=200, value=int(p.max_trail_landmarks), step=1)
        p.I0 = st.number_input("I0", min_value=0.0, value=float(p.I0), step=0.1)
        p.alpha_D = st.number_input("alpha_D", min_value=0.0, value=float(p.alpha_D), step=0.1)
        p.mu_D = st.number_input("mu_D", min_value=0.0, value=float(p.mu_D), step=0.01)
        p.gamma = st.number_input("gamma", min_value=0.1, value=float(p.gamma), step=0.1)
        p.q0_flow = st.number_input("q0_flow", min_value=0.0, value=float(p.q0_flow), step=0.1)
        p.D_min = st.number_input("D_min", min_value=0.0, value=float(p.D_min), step=0.0001, format="%.5f")
        p.D_init = st.number_input("D_init", min_value=0.0, value=float(p.D_init), step=0.01)
        p.path_eta = st.number_input("path_eta", min_value=0.0, value=float(p.path_eta), step=0.1)
        p.rho_network = st.number_input("rho_network", min_value=0.0, value=float(p.rho_network), step=0.01)
        p.show_network_overlay = st.checkbox("show_network_overlay", value=bool(p.show_network_overlay))
        p.show_shortest_path_overlay = st.checkbox("show_shortest_path_overlay", value=bool(p.show_shortest_path_overlay))

    with st.expander("Scientific Plot Visualization", expanded=False):
        p.show_agents = st.checkbox("show_agents", value=bool(p.show_agents))
        p.show_food = st.checkbox("show_food", value=bool(p.show_food))
        p.show_trail_heatmap = st.checkbox("show_trail_heatmap", value=bool(p.show_trail_heatmap))
        p.show_obstacles = st.checkbox("show_obstacles", value=bool(p.show_obstacles))
        p.show_colorbar = st.checkbox("show_colorbar", value=bool(p.show_colorbar))
        p.figure_size = st.slider("figure_size", min_value=4.0, max_value=14.0, value=float(p.figure_size), step=0.5)
        p.agent_marker_size = st.slider("agent_marker_size", min_value=1.0, max_value=30.0, value=float(p.agent_marker_size), step=1.0)

    with st.expander("Execution", expanded=True):
        step_once = st.button("Step once", key="controls_step_once")
        run_n = st.number_input("N steps", min_value=1, max_value=1000, value=10, step=1)
        run_many = st.button("Run N steps", key="controls_run_many")
        reset_exec = st.button("Reset simulation", key="controls_reset_exec")

    return p, {
        "reset": reset_world or reset_exec,
        "step_once": step_once,
        "run_many": run_many,
        "n_steps": int(run_n),
    }


def apply_live_params(sim: PhysarumSimulation, new_params: SimParams) -> None:
    """Apply shape-safe parameters to a running simulation."""

    old = sim.params
    live = replace(new_params, W=old.W, H=old.H, random_seed=old.random_seed)
    sim.params = live


def metrics_dataframe() -> pd.DataFrame:
    return pd.DataFrame(st.session_state.metrics_history)


def append_metric_rows(rows: list[dict[str, float]]) -> None:
    st.session_state.metrics_history.extend(rows)
    max_rows = 5000
    if len(st.session_state.metrics_history) > max_rows:
        st.session_state.metrics_history = st.session_state.metrics_history[-max_rows:]


def render_metric_cards(metrics: dict[str, float]) -> None:
    cards = [
        ("Step", "step", "{:.0f}"),
        ("Alive", "alive_agents", "{:.0f}"),
        ("Avg Energy", "average_energy", "{:.2f}"),
        ("Biomass", "total_biomass", "{:.1f}"),
        ("Food", "remaining_food_calories", "{:.1f}"),
        ("Consumed", "consumed_food_calories", "{:.1f}"),
        ("Trail Area", "trail_coverage", "{:.0f}"),
        ("Net Eff.", "network_efficiency", "{:.4f}"),
    ]
    for start in (0, 4):
        cols = st.columns(4)
        for col, (label, key, fmt) in zip(cols, cards[start : start + 4]):
            col.metric(label, fmt.format(metrics.get(key, 0.0)))
    st.metric("Shortest path length", f"{metrics.get('shortest_path_length', 0.0):.2f}")


def render_download_buttons(sim: PhysarumSimulation) -> None:
    metric_df = metrics_dataframe()
    food_df = sim.get_food_dataframe()
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.download_button("Parameters JSON", data=sim.to_params_json(), file_name="physarum_params.json", mime="application/json")
    c2.download_button("Metrics CSV", data=metric_df.to_csv(index=False), file_name="physarum_metrics.csv", mime="text/csv")
    c3.download_button("Food CSV", data=food_df.to_csv(index=False), file_name="physarum_food.csv", mime="text/csv")
    c4.download_button("model.tex", data=get_latex_document(), file_name="model.tex", mime="application/x-tex")
    c5.download_button("references.bib", data=get_bibtex(), file_name="references.bib", mime="text/plain")


def render_live_view_tab(sim: PhysarumSimulation) -> None:
    st.subheader("Live View")
    visual_params: VisualParams = st.session_state.visual_params

    control_a, control_b, control_c = st.columns([1.0, 1.1, 1.0], gap="large")
    with control_a:
        play_enabled = st.toggle("Play", value=bool(st.session_state.play_enabled), key="live_play_enabled")
        st.session_state.play_enabled = play_enabled
        step_once = st.button("Step once", key="live_step_once")
        run_live_batch_clicked = st.button("Run live batch", key="live_run_batch")
        rendering_mode = st.radio(
            "Live rendering mode",
            ["responsive rerun", "batch animation"],
            horizontal=True,
            key="live_rendering_mode",
        )

    with control_b:
        modes = ["scientific", "petri_dish", "maze"]
        visual_params.visual_mode = st.selectbox(
            "Visual mode",
            modes,
            index=modes.index(visual_params.visual_mode) if visual_params.visual_mode in modes else modes.index("petri_dish"),
        )
        visual_params.fps = st.slider("FPS", min_value=1, max_value=30, value=int(visual_params.fps), step=1)
        visual_params.sim_steps_per_frame = st.slider(
            "Simulation steps per frame",
            min_value=1,
            max_value=20,
            value=int(visual_params.sim_steps_per_frame),
            step=1,
        )
        visual_params.frames_per_live_batch = st.slider(
            "Frames per live batch",
            min_value=5,
            max_value=400,
            value=int(visual_params.frames_per_live_batch),
            step=5,
        )

    with control_c:
        visual_params.show_hud = st.checkbox("Show HUD", value=bool(visual_params.show_hud))
        show_scientific_overlay = st.checkbox("Scientific debug overlay", value=False, key="show_scientific_overlay")
        visual_params.show_agents_in_art_mode = st.checkbox(
            "Show agents in art mode",
            value=bool(visual_params.show_agents_in_art_mode),
        )
        visual_params.show_network_in_art_mode = st.checkbox(
            "Show biological network",
            value=bool(visual_params.show_network_in_art_mode),
        )
        visual_params.show_shortest_path_in_art_mode = st.checkbox(
            "Show shortest path",
            value=bool(visual_params.show_shortest_path_in_art_mode),
        )

    preset_cols = st.columns([1.0, 0.55, 1.0, 0.55], gap="medium")
    with preset_cols[0]:
        preset = st.selectbox("Experiment preset", EXPERIMENT_PRESETS, key="experiment_preset")
    with preset_cols[1]:
        if st.button("Load preset", key="load_experiment_preset", width="stretch"):
            new_sim, new_params, visual_mode = apply_experiment_preset(st.session_state.params, preset)
            st.session_state.sim = new_sim
            st.session_state.params = new_params
            st.session_state.visual_params.visual_mode = visual_mode
            st.session_state.metrics_history = [new_sim.get_metrics()]
            st.session_state.play_enabled = False
            st.rerun()
    with preset_cols[2]:
        world_preset = st.selectbox("World preset", WORLD_PRESETS, key="world_preset")
        uploaded_mask = None
        if world_preset == "uploaded_mask":
            uploaded_mask = st.file_uploader("Upload mask image", type=["png", "jpg", "jpeg"], key="uploaded_mask")
    with preset_cols[3]:
        if st.button("Apply world", key="apply_world_preset", width="stretch"):
            visual_mode = apply_world_preset(sim, world_preset, uploaded_mask)
            st.session_state.visual_params.visual_mode = visual_mode
            st.success("World preset applied.")

    if play_enabled and rendering_mode == "responsive rerun" and not HAS_AUTOREFRESH:
        st.warning("streamlit-autorefresh is not installed, so Play cannot tick automatically. Use Run live batch for finite animation.")

    frame_placeholder = st.empty()
    controller = AnimationController(sim, visual_params)

    if step_once:
        rows, frame, perf = controller.step_and_render(scientific_overlay=show_scientific_overlay)
        append_metric_rows(rows)
        st.session_state.last_perf = perf
        frame_placeholder.image(frame, width="stretch")
    elif run_live_batch_clicked or (play_enabled and rendering_mode == "batch animation"):
        if not HAS_AUTOREFRESH and rendering_mode == "responsive rerun":
            st.warning("Using finite batch fallback because streamlit-autorefresh is unavailable.")
        perf = run_live_batch(
            sim,
            visual_params,
            frame_placeholder,
            scientific_overlay=show_scientific_overlay,
            on_metrics=append_metric_rows,
            on_perf=lambda data: st.session_state.update({"last_perf": data}),
        )
        st.session_state.last_perf = perf
    else:
        if play_enabled and rendering_mode == "responsive rerun" and HAS_AUTOREFRESH:
            maybe_autorefresh(True, visual_params.fps, key="animation_tick")
            rows, frame, perf = controller.step_and_render(scientific_overlay=show_scientific_overlay)
            append_metric_rows(rows)
            st.session_state.last_perf = perf
        else:
            render_start = time.perf_counter()
            frame = render_frame(sim, visual_params, scientific_overlay=show_scientific_overlay)
            render_ms = (time.perf_counter() - render_start) * 1000.0
            st.session_state.last_perf = {
                **st.session_state.last_perf,
                "last_frame_render_ms": render_ms,
            }
        frame_placeholder.image(frame, width="stretch")

    render_performance_panel(sim)
    render_gif_export(sim, visual_params, show_scientific_overlay)


def render_performance_panel(sim: PhysarumSimulation) -> None:
    perf = st.session_state.last_perf
    cols = st.columns(5)
    cols[0].metric("Measured FPS", f"{perf.get('measured_fps', 0.0):.1f}")
    cols[1].metric("Render ms", f"{perf.get('last_frame_render_ms', 0.0):.1f}")
    cols[2].metric("Sim ms", f"{perf.get('last_simulation_step_ms', 0.0):.1f}")
    cols[3].metric("Agents", f"{len(sim.positions):,}")
    cols[4].metric("Grid", f"{sim.params.W} x {sim.params.H}")
    target = max(1, int(st.session_state.visual_params.fps))
    measured = float(perf.get("measured_fps", 0.0))
    if measured and measured < target * 0.55:
        st.warning("FPS is low. Try a smaller grid, fewer agents, fewer simulation steps per frame, or hide debug overlays.")


def render_gif_export(sim: PhysarumSimulation, visual_params: VisualParams, scientific_overlay: bool) -> None:
    with st.expander("GIF export", expanded=False):
        record_frames = st.checkbox("record_frames", value=False)
        gif_fps = st.slider("gif_fps", min_value=1, max_value=30, value=min(12, int(visual_params.fps)), step=1)
        max_gif_frames = st.slider("max_gif_frames", min_value=5, max_value=240, value=60, step=5)
        if st.button("Record GIF", disabled=not record_frames, key="record_gif"):
            frames: list[Image.Image] = []
            all_rows: list[dict[str, float]] = []
            with st.spinner(f"Recording {max_gif_frames} frames..."):
                for _ in range(max_gif_frames):
                    all_rows.extend(sim.step(visual_params.sim_steps_per_frame))
                    frames.append(Image.fromarray(render_frame(sim, visual_params, scientific_overlay=scientific_overlay)))
                append_metric_rows(all_rows)
                buffer = BytesIO()
                frames[0].save(
                    buffer,
                    format="GIF",
                    save_all=True,
                    append_images=frames[1:],
                    duration=int(1000 / max(1, gif_fps)),
                    loop=0,
                )
                st.session_state.gif_bytes = buffer.getvalue()
        if st.session_state.gif_bytes:
            st.download_button(
                "Download GIF",
                data=st.session_state.gif_bytes,
                file_name="physarum_live_animation.gif",
                mime="image/gif",
            )


def render_simulation_tab(sim: PhysarumSimulation) -> None:
    metrics = sim.get_metrics()
    render_metric_cards(metrics)
    fig = plot_simulation(sim, sim.params)
    st.pyplot(fig, clear_figure=True)
    st.session_state.last_rendered_figure = fig

    st.subheader("Export")
    render_download_buttons(sim)


def render_metrics_tab() -> None:
    sim: PhysarumSimulation = st.session_state.sim
    render_metric_cards(sim.get_metrics())
    df = metrics_dataframe()
    fig = plot_metric_history(df)
    st.pyplot(fig, clear_figure=True)
    st.dataframe(df, width="stretch", hide_index=True)
    with st.expander("Scientific matplotlib snapshot", expanded=False):
        scientific_fig = plot_simulation(sim, sim.params)
        st.pyplot(scientific_fig, clear_figure=True)
    st.subheader("Export")
    render_download_buttons(sim)


def maybe_render_clickable_editor_image(sim: PhysarumSimulation) -> None:
    """Use streamlit-image-coordinates when it is installed; otherwise show fallback text."""

    try:
        from PIL import Image
        from streamlit_image_coordinates import streamlit_image_coordinates
    except Exception:
        st.info("Click-to-set coordinates are unavailable because streamlit-image-coordinates is not installed. Use the coordinate boxes below.")
        return

    fig = plot_simulation(sim, sim.params)
    buffer = BytesIO()
    dpi = 120
    fig.savefig(buffer, format="png", dpi=dpi)
    plt.close(fig)
    buffer.seek(0)
    try:
        image = Image.open(buffer)
        value = streamlit_image_coordinates(image, key="editor_click_image")
    except Exception as exc:
        st.info(f"Click-to-set coordinates could not be initialized ({exc}). Use the coordinate boxes below.")
        return

    if value and value.get("x") is not None and value.get("y") is not None:
        width, height = image.size
        st.session_state.editor_x = float(value["x"]) / max(width, 1) * sim.params.W
        st.session_state.editor_y = (1.0 - float(value["y"]) / max(height, 1)) * sim.params.H


def render_editor_tab(sim: PhysarumSimulation) -> None:
    left, right = st.columns([1.1, 1.0], gap="large")
    with left:
        st.subheader("Canvas")
        maybe_render_clickable_editor_image(sim)

    with right:
        st.subheader("Editor")
        st.session_state.selected_editor_mode = st.radio(
            "Mode",
            ["Add agents", "Add food", "Remove nearest food", "Add obstacle rectangle", "Erase obstacle rectangle"],
            index=["Add agents", "Add food", "Remove nearest food", "Add obstacle rectangle", "Erase obstacle rectangle"].index(
                st.session_state.selected_editor_mode
            ),
            horizontal=True,
        )
        x = st.number_input("x", min_value=0.0, max_value=float(sim.params.W), value=float(st.session_state.editor_x), step=1.0)
        y = st.number_input("y", min_value=0.0, max_value=float(sim.params.H), value=float(st.session_state.editor_y), step=1.0)
        st.session_state.editor_x = x
        st.session_state.editor_y = y

        st.markdown("**Food**")
        food_calories = st.number_input("calories", min_value=0.0, value=float(sim.params.default_food_calories), step=50.0)
        food_quality = st.number_input("quality", min_value=0.01, value=1.0, step=0.1)
        food_sigma = st.number_input("sigma_food for new source", min_value=0.1, value=float(sim.params.sigma_food), step=0.5)
        food_radius = st.number_input("food radius / size", min_value=0.1, value=float(sim.params.default_food_radius), step=0.5)

        st.markdown("**Agents**")
        agent_count = st.number_input("count", min_value=1, max_value=max(1, sim.params.max_agents), value=100, step=10)
        agent_energy = st.number_input("energy", min_value=0.0, value=float(sim.params.initial_energy), step=5.0)
        agent_mass = st.number_input("mass", min_value=0.01, value=float(sim.params.initial_mass), step=0.1)

        st.markdown("**Obstacle rectangle**")
        x0 = st.number_input("x0", min_value=0.0, max_value=float(sim.params.W), value=max(0.0, x - 5.0), step=1.0)
        y0 = st.number_input("y0", min_value=0.0, max_value=float(sim.params.H), value=max(0.0, y - 5.0), step=1.0)
        x1 = st.number_input("x1", min_value=0.0, max_value=float(sim.params.W), value=min(float(sim.params.W), x + 5.0), step=1.0)
        y1 = st.number_input("y1", min_value=0.0, max_value=float(sim.params.H), value=min(float(sim.params.H), y + 5.0), step=1.0)

        b1, b2, b3 = st.columns(3)
        b4, b5, b6 = st.columns(3)
        if b1.button("Add food"):
            sim.add_food(x, y, food_calories, food_quality, food_sigma, food_radius)
            sim.compute_food_field()
            st.success("Food added.")
        if b2.button("Add agents"):
            sim.add_agents(x, y, int(agent_count), agent_energy, agent_mass)
            st.success("Agents added.")
        if b3.button("Remove nearest food"):
            removed = sim.remove_food_near(x, y, radius=max(3.0, sim.params.eat_radius * 2.0))
            st.success("Food removed." if removed else "No nearby food found.")
        if b4.button("Add obstacle"):
            sim.add_obstacle_rect(x0, y0, x1, y1)
            st.success("Obstacle added.")
        if b5.button("Erase obstacle"):
            sim.erase_obstacle_rect(x0, y0, x1, y1)
            st.success("Obstacle erased.")
        if b6.button("Clear all food"):
            sim.food_sources.clear()
            sim.compute_food_field()
            st.success("All food cleared.")

    st.subheader("Food table")
    st.dataframe(sim.get_food_dataframe(), width="stretch", hide_index=True)

    if sim.food_sources:
        st.subheader("Edit selected food")
        labels = [
            f"F{idx}  x={food.x:.1f}, y={food.y:.1f}, calories={food.calories:.1f}, radius={getattr(food, 'radius', sim.params.default_food_radius):.1f}"
            for idx, food in enumerate(sim.food_sources)
        ]
        selected_label = st.selectbox("food source", labels)
        selected_idx = labels.index(selected_label)
        selected_food = sim.food_sources[selected_idx]
        e1, e2, e3, e4 = st.columns(4)
        edited_calories = e1.number_input(
            "selected calories",
            min_value=0.0,
            value=float(selected_food.calories),
            step=25.0,
            key=f"selected_food_calories_{selected_idx}",
        )
        edited_radius = e2.number_input(
            "selected radius / size",
            min_value=0.1,
            value=float(getattr(selected_food, "radius", sim.params.default_food_radius)),
            step=0.5,
            key=f"selected_food_radius_{selected_idx}",
        )
        edited_quality = e3.number_input(
            "selected quality",
            min_value=0.01,
            value=float(selected_food.quality),
            step=0.1,
            key=f"selected_food_quality_{selected_idx}",
        )
        edited_sigma = e4.number_input(
            "selected attractant spread",
            min_value=0.1,
            value=float(selected_food.sigma),
            step=0.5,
            key=f"selected_food_sigma_{selected_idx}",
        )
        u1, u2 = st.columns(2)
        if u1.button("Update selected food"):
            sim.update_food(
                selected_idx,
                calories=edited_calories,
                quality=edited_quality,
                sigma=edited_sigma,
                radius=edited_radius,
            )
            sim.compute_food_field()
            st.success("Selected food updated.")
        if u2.button("Remove selected food"):
            del sim.food_sources[selected_idx]
            sim.compute_food_field()
            st.success("Selected food removed.")

    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Parameter summary")
        summary_values = [str(value) for value in asdict(sim.params).values()]
        summary = pd.DataFrame({"parameter": list(asdict(sim.params).keys()), "value": summary_values})
        st.dataframe(summary, width="stretch", hide_index=True)
    with c2:
        st.subheader("Agent summary")
        st.dataframe(sim.get_agent_summary(), width="stretch", hide_index=True)


def render_math_tab() -> None:
    st.subheader("Key equations")
    for name, equation in get_key_equations().items():
        st.markdown(f"**{name}**")
        st.latex(equation)
    st.download_button("Download full LaTeX model", data=get_latex_document(), file_name="model.tex", mime="application/x-tex")
    with st.expander("Full model.tex preview"):
        st.code(get_latex_document(), language="latex")


def parse_bibtex_entries(bibtex: str) -> list[dict[str, str]]:
    def extract_balanced_field(chunk: str, field: str) -> str:
        idx = chunk.lower().find(field)
        if idx == -1:
            return ""
        brace_start = chunk.find("{", idx)
        if brace_start == -1:
            return ""
        depth = 0
        for pos in range(brace_start, len(chunk)):
            if chunk[pos] == "{":
                depth += 1
            elif chunk[pos] == "}":
                depth -= 1
                if depth == 0:
                    return chunk[brace_start + 1 : pos].strip()
        return ""

    entries: list[dict[str, str]] = []
    for chunk in bibtex.split("@article"):
        if "{" not in chunk:
            continue
        key = chunk.split("{", 1)[1].split(",", 1)[0].strip()
        entry: dict[str, str] = {"key": key}
        for field in ["author", "title", "journal", "year", "doi"]:
            value = extract_balanced_field(chunk, field)
            if value:
                entry[field] = value
        entries.append(entry)
    return entries


def render_references_tab() -> None:
    st.subheader("Bibliography")
    entries = parse_bibtex_entries(get_bibtex())
    for entry in entries:
        st.markdown(
            f"**{entry.get('key', '')}**: {entry.get('author', '')}. "
            f"*{entry.get('title', '')}*. {entry.get('journal', '')}, {entry.get('year', '')}. "
            f"DOI: `{entry.get('doi', '')}`"
        )
    st.download_button("Download references.bib", data=get_bibtex(), file_name="references.bib", mime="text/plain")


def render_about_tab() -> None:
    st.markdown(
        """
        This is an idealized computational model of Physarum-like behavior. It combines
        a Jones-style multi-agent local sensing model with trail deposition, diffusion,
        and decay, plus a Tero-style adaptive transport-network layer based on pressure,
        flow, and conductance adaptation.

        Dijkstra shortest paths are used only as an analysis and visualization overlay
        after adaptive conductances evolve. They do not create the transport network.

        Food calories are abstract simulation units rather than biological calorimetry.
        Parameters are intentionally exposed so you can explore regimes that search,
        exploit, collapse into dormancy, or reinforce nutrient transport paths.
        """
    )


def main() -> None:
    initialize_state()
    st.title("Interactive Physarum Slime Mold Simulator")

    tabs = st.tabs(["Live View", "Simulation Controls", "Metrics", "Food & Agents Editor", "Mathematical Model", "References", "About"])

    with tabs[1]:
        new_params, actions = render_controls_panel(st.session_state.params)

    st.session_state.params = new_params

    if actions["reset"]:
        st.session_state.sim = PhysarumSimulation(new_params)
        st.session_state.metrics_history = [st.session_state.sim.get_metrics()]
        st.session_state.play_enabled = False
    else:
        apply_live_params(st.session_state.sim, new_params)

    sim: PhysarumSimulation = st.session_state.sim

    if actions["step_once"]:
        append_metric_rows(sim.step(1))
    if actions["run_many"]:
        with st.spinner(f"Running {actions['n_steps']} steps..."):
            append_metric_rows(sim.step(actions["n_steps"]))

    with tabs[0]:
        render_live_view_tab(sim)
    with tabs[2]:
        render_metrics_tab()
    with tabs[3]:
        render_editor_tab(sim)
    with tabs[4]:
        render_math_tab()
    with tabs[5]:
        render_references_tab()
    with tabs[6]:
        render_about_tab()


if __name__ == "__main__":
    main()
