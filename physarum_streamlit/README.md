# Interactive Physarum Slime Mold Simulator

Complete Streamlit application for exploring an idealized two-dimensional
Physarum polycephalum model with local agent sensing, trail deposition,
food consumption, energy dynamics, growth, division, dormancy/death, and a
Physarum-inspired adaptive transport-network solver.

![screenshot placeholder](docs/screenshot-placeholder.png)

## Installation

Use Python 3.10 or newer.

```bash
cd physarum_streamlit
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`streamlit-image-coordinates` is optional at runtime. If it is unavailable, the
editor uses stable coordinate input boxes instead of click-to-set coordinates.

## Running

```bash
streamlit run app.py
```

## Controls

The sidebar exposes the main model parameters:

- World dimensions, boundary handling, seed, and reset.
- Agent count, maximum population, energy cap, initial mass, and death policy.
- Movement speed, sensor distance, sensor angle, turn angle, and sensory weights.
- Trail deposition, diffusion, decay, and trail energy cost.
- Food count, calories, quality, visible/physical radius, bite rate, eating radius, and attractant spread.
- Energy costs for metabolism, movement, dormancy, and growth.
- Growth and division thresholds.
- Search-versus-exploit logistic decision parameters.
- Adaptive network conductance, flow, graph, and overlay parameters.
- Visualization toggles for agents, food, trail, obstacles, network, and path.

Execution is intentionally click-driven. Use **Step once** or **Run N steps**;
or enable **Live animation** to advance a small number of steps on each timed
rerun. There is no infinite background loop, so the app remains responsive and
can be paused from the sidebar.

## Model Overview

Agents are continuous points in a rectangular grid world. Each agent senses the
combined field at front, left-forward, and right-forward sensor points, turns
toward stronger signals, and optionally adds random motion during broad search.
Agents spend energy on metabolism, movement, trail deposition, and growth. Food
restores energy through proportional sharing when multiple agents reach the same
source. Food radius controls the visible food size and expands the local
consumption neighborhood. High-energy agents grow and divide, while low-energy
agents are removed or become dormant depending on the selected policy. When the
continue-search setting is enabled, agents keep searching after all food is
exhausted instead of treating the depleted world as an exploit target.

The optional network layer builds a graph from the colony center, active food
sources, and high-trail landmarks. It solves a pressure-flow system and adapts
edge conductances using a flow-dependent reinforcement and decay equation.
Dijkstra shortest paths are computed only after conductance adaptation and are
used for visualization and metrics, not as the network optimization mechanism.

## Mathematical Documentation

The full mathematical model is in:

- `docs/model.tex`
- `docs/references.bib`

The Streamlit app includes a Mathematical Model tab with key equations and
download buttons for both files.

## References

The bibliography includes:

- Nakagaki, Yamada, and Toth (2000), maze solving by an amoeboid organism.
- Tero, Kobayashi, and Nakagaki (2007), adaptive transport networks.
- Tero et al. (2010), biologically inspired adaptive network design.
- Jones (2010, 2011), multi-agent Physarum network approximations.
- Bonifaci (2013), mathematical shortest-path convergence.
- Dussutour et al. (2010), nutritional challenge solving.

## Limitations

This is not a calibrated biological model. Food calories are abstract units,
agent division is computationally simplified, and the graph network is an
analysis/reinforcement abstraction rather than a physical tube-resolved model.
The goal is a scientifically motivated, internally consistent simulator for
interactive exploration.

## Extension Ideas

- Add multi-nutrient food composition instead of a single calorie scalar.
- Add light or hazard fields and agent avoidance learning.
- Use spatial indexes for very large numbers of food sources.
- Add saved scenario presets and replay export.
- Add richer obstacle editing and maze import from images.
- Compare network metrics against minimum spanning tree and Steiner-like baselines.
