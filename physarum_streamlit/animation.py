"""Streamlit-friendly animation helpers for the live Physarum view."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Callable

import streamlit as st

from visual_style import VisualParams, render_frame


try:
    from streamlit_autorefresh import st_autorefresh

    HAS_AUTOREFRESH = True
except Exception:
    HAS_AUTOREFRESH = False
    st_autorefresh = None  # type: ignore[assignment]


@dataclass
class AnimationController:
    """Advance the simulation and render one measured frame."""

    sim: Any
    visual_params: VisualParams

    def step_and_render(self, scientific_overlay: bool = False) -> tuple[list[dict[str, float]], Any, dict[str, float]]:
        sim_start = time.perf_counter()
        rows = self.sim.step(self.visual_params.sim_steps_per_frame)
        sim_ms = (time.perf_counter() - sim_start) * 1000.0

        render_start = time.perf_counter()
        frame = render_frame(self.sim, self.visual_params, scientific_overlay=scientific_overlay)
        render_ms = (time.perf_counter() - render_start) * 1000.0

        total_ms = sim_ms + render_ms
        fps = 1000.0 / total_ms if total_ms > 0.0 else 0.0
        perf = {
            "last_simulation_step_ms": sim_ms,
            "last_frame_render_ms": render_ms,
            "measured_fps": fps,
        }
        return rows, frame, perf


def maybe_autorefresh(play_enabled: bool, fps: int, key: str = "physarum_autorefresh") -> bool:
    """Trigger a Streamlit autorefresh tick when the optional package is installed."""

    if not play_enabled or not HAS_AUTOREFRESH or st_autorefresh is None:
        return False
    interval = int(1000 / max(1, fps))
    st_autorefresh(interval=interval, key=key)
    return True


def run_live_batch(
    sim: Any,
    visual_params: VisualParams,
    frame_placeholder: Any,
    *,
    scientific_overlay: bool = False,
    on_metrics: Callable[[list[dict[str, float]]], None] | None = None,
    on_perf: Callable[[dict[str, float]], None] | None = None,
) -> dict[str, float]:
    """Run a finite batch of live frames and update a Streamlit image placeholder."""

    controller = AnimationController(sim, visual_params)
    last_perf: dict[str, float] = {}
    for _ in range(max(1, int(visual_params.frames_per_live_batch))):
        rows, frame, perf = controller.step_and_render(scientific_overlay=scientific_overlay)
        if on_metrics is not None:
            on_metrics(rows)
        if on_perf is not None:
            on_perf(perf)
        last_perf = perf
        frame_placeholder.image(frame, width="stretch")
        time.sleep(1.0 / max(1, int(visual_params.fps)))
    return last_perf
