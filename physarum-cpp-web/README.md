# Physarum Lab

Interactive Physarum slime mold simulator with a C++ simulation core, WebAssembly build hooks, and a React/Vite frontend. The current app runs with a TypeScript fallback simulator when Emscripten is not available; after `emcc` is installed, `npm run build:wasm` emits the C++ module under `public/wasm`.

## Run

```bash
npm install
npm run build:wasm
npm run dev
```

Open the local Vite URL printed in the terminal.

## Test

```bash
npm test
npm run build
```

## Model

The simulator combines:

- Jones-style agents with trail deposition, diffusion, decay, and chemotaxis sensors.
- Food attractant fields with calories, quality, radius, and depletion.
- Energy budget for movement, basal metabolism, searching, eating, growth, division, dormancy, and death.
- A Tero-style adaptive nutrient transport graph with conductance, flow, Dijkstra path, transport cost, and dissipation.

See `docs/model.tex` for formulas and `docs/references.bib` for sources.

## WebAssembly

`npm run build:wasm` compiles `cpp/physarum.cpp` and `cpp/wasm_exports.cpp` with Emscripten when `emcc` is available. Without Emscripten, the command exits successfully and the UI uses the fallback engine so the app remains inspectable.
