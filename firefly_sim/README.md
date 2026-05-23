# Firefly Synchronization Lab

Interactive spatial Kuramoto firefly simulator with a C++17 simulation core compiled to WebAssembly and a TypeScript fallback for local preview when Emscripten is not installed.

## Quick Start

```bash
npm install
npm run build:wasm
npm run dev
npm test
```

Open the Vite URL, usually `http://localhost:5173/`.

If `npm run build:wasm` reports that `emcc` is missing, activate an Emscripten SDK shell and rerun it. The web app still runs with the JS fallback and shows `Engine: fallback` in the UI.

## Project Layout

- `cpp/firefly.hpp`, `cpp/firefly.cpp`: C++ spatial Kuramoto model, metrics, obstacles, city forcing, two-species coupling, and scans.
- `cpp/wasm_exports.cpp`: flat C ABI and typed-array buffers for browser use.
- `src/wasm/firefly.ts`: TypeScript wrapper that hides WASM pointers from React.
- `src/wasm/fallback.ts`: development fallback implementing the same adapter API.
- `src/components/`: simulator canvas, controls, metrics, formula, and scan panels.
- `docs/model.tex`, `docs/references.bib`: model derivation, notation, assumptions, and sources.

## Model Features

- Local spatial coupling through `R_visual` with normalized neighbor influence.
- Euler-Maruyama phase updates with noise strength `D`.
- Phase-derived binary, cosine, and spike flash brightness.
- Global Kuramoto order parameter `r(t)` and local order `r_local`.
- Parameter scans for `K`, `R_visual`, and `D`, including threshold-based `K_c` estimate.
- City light forcing with lock metric `Delta_lock`.
- Circular forest obstacles that can block line-of-sight coupling.
- One-species and two-species oscillator populations.
- Optional active Brownian firefly motion with reflective boundaries.
- Bat predators that patrol, chase bright nearby fireflies, trigger avoidance, and capture prey.

## WASM Build

The build script emits `public/wasm/firefly.js` and `public/wasm/firefly.wasm`:

```bash
npm run build:wasm
```

The app first tries to load `/wasm/firefly.js`. If that fails, it uses `FallbackFireflyAdapter` and clearly labels the engine as fallback.

## Tests

```bash
npm test
```

This runs:

- Native C++ tests for phase wrapping, visibility, order parameter, coupling trend, local order, and scan output.
- Vitest tests for fallback adapter initialization, stepping, metrics, obstacles, and scan results.
- Mobility and predator tests for bounded movement, bat creation, panic, and capture metrics.

`npm run build` runs TypeScript checking and Vite production bundling.

## LaTeX

Compile the model document with:

```bash
cd docs
latexmk -pdf model.tex
```

If `latexmk` is unavailable, the `.tex` and `.bib` sources are still usable in TeX editors or Overleaf.
