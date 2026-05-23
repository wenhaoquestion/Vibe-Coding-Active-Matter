import "./styles.css";
import { Renderer } from "./render/renderer";
import { createDefaultParams, type ToolMode } from "./ui/controls";
import { createPanel, type PanelApi } from "./ui/panel";
import { createWasmSimulation, type WasmSimulation } from "./wasm/loader";
import type { ExportedState, NetworkState, SimStats } from "./wasm/types";

const SIM_WIDTH = 512;
const SIM_HEIGHT = 512;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app root.");
}

app.innerHTML = `
  <main class="app-shell">
    <aside class="side-panel" id="panel"></aside>
    <section class="stage">
      <canvas id="sim-canvas" aria-label="Physarum slime mold simulation canvas"></canvas>
      <div class="canvas-hud" id="canvas-hud">Preparing simulation...</div>
    </section>
  </main>
`;

const panelRoot = document.querySelector<HTMLElement>("#panel");
const canvasNode = document.querySelector<HTMLCanvasElement>("#sim-canvas");
const hudNode = document.querySelector<HTMLElement>("#canvas-hud");
if (!panelRoot || !canvasNode || !hudNode) {
  throw new Error("Failed to initialize application shell.");
}
const canvas: HTMLCanvasElement = canvasNode;
const hud: HTMLElement = hudNode;

const params = createDefaultParams();
let sim: WasmSimulation | null = null;
let panel: PanelApi;
let renderer: Renderer;
let currentTool: ToolMode = "slime";
let playing = true;
let pointerDown = false;
let lastFrame = performance.now();
let network: NetworkState | null = null;
let frames = 0;
let fps = 0;
let fpsTimer = performance.now();
let fpsFrames = 0;

function downloadText(filename: string, text: string, type = "application/json"): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportScreenshot(): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `physarum-${Date.now()}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function seedColony(): void {
  if (!sim) return;
  const radius = Math.min(SIM_WIDTH, SIM_HEIGHT) * 0.13;
  sim.addAgents(SIM_WIDTH * 0.5, SIM_HEIGHT * 0.5, params.targetAgentCount, radius);
}

function resetScenario(): void {
  if (!sim) return;
  sim.reset(params.randomSeed);
  sim.setParams(params);
  seedColony();
  sim.addFood(SIM_WIDTH * 0.22, SIM_HEIGHT * 0.28, params.foodCalories, params.foodRadius, params.attractorStrength);
  sim.addFood(SIM_WIDTH * 0.78, SIM_HEIGHT * 0.70, params.foodCalories * 0.85, params.foodRadius * 1.1, params.attractorStrength);
  network = null;
  panel.updateStats(sim.stats());
}

function inspectAt(x: number, y: number): void {
  if (!sim) return;
  const state = sim.exportState();
  let bestAgent: ExportedState["agents"][number] | null = null;
  let bestAgentD = Number.POSITIVE_INFINITY;
  for (const agent of state.agents) {
    const d = Math.hypot(agent.x - x, agent.y - y);
    if (d < bestAgentD) {
      bestAgentD = d;
      bestAgent = agent;
    }
  }
  let bestFood: ExportedState["foods"][number] | null = null;
  let bestFoodD = Number.POSITIVE_INFINITY;
  for (const food of state.foods) {
    const d = Math.hypot(food.x - x, food.y - y);
    if (d < bestFoodD) {
      bestFoodD = d;
      bestFood = food;
    }
  }
  if (bestFood && bestFoodD <= bestFood.radius + 8) {
    panel.setInspectText(
      `Food #${bestFood.id}
x ${bestFood.x.toFixed(1)}  y ${bestFood.y.toFixed(1)}
calories ${bestFood.calories.toFixed(1)} / ${bestFood.maxCalories.toFixed(1)}
radius ${bestFood.radius.toFixed(1)}
attractor ${bestFood.attractorStrength.toFixed(1)}
enabled ${bestFood.enabled}`,
    );
    return;
  }
  if (bestAgent && bestAgentD <= 10) {
    panel.setInspectText(
      `Agent #${bestAgent.id}
x ${bestAgent.x.toFixed(1)}  y ${bestAgent.y.toFixed(1)}
energy ${bestAgent.energy.toFixed(2)}
angle ${bestAgent.angle.toFixed(2)}
mode ${bestAgent.search ? "search" : "exploit"}`,
    );
    return;
  }
  panel.setInspectText(`Cell x ${x.toFixed(1)}  y ${y.toFixed(1)}
No nearby agent or food source.`);
}

function applyCanvasTool(event: PointerEvent, dragged: boolean): void {
  if (!sim) return;
  const { x, y } = renderer.canvasToSim(event.clientX, event.clientY);
  if (currentTool === "slime") {
    const count = dragged ? Math.max(1, Math.floor(params.brushAgents / 8)) : params.brushAgents;
    sim.addAgents(x, y, count, params.brushRadius);
  } else if (currentTool === "food" && !dragged) {
    sim.addFood(x, y, params.foodCalories, params.foodRadius, params.attractorStrength);
  } else if (currentTool === "erase") {
    sim.eraseAt(x, y, params.brushRadius, true, true, true, true);
  } else if (currentTool === "wall") {
    sim.addWall(x, y, params.brushRadius);
  } else if (currentTool === "inspect" && !dragged) {
    inspectAt(x, y);
  }
}

function updateHud(stats: SimStats | null): void {
  const status = playing ? "running" : "paused";
  const live = stats ? stats.liveAgents.toLocaleString() : "0";
  const energy = stats ? stats.averageEnergy.toFixed(1) : "0.0";
  hud.textContent = `${currentTool} | ${status} | ${fps.toFixed(0)} fps | live ${live} | avg energy ${energy}`;
}

panel = createPanel(panelRoot, params, currentTool, {
  onToolChange(tool) {
    currentTool = tool;
    updateHud(sim ? sim.stats() : null);
  },
  onParamsChange(nextParams) {
    Object.assign(params, nextParams);
    sim?.setParams(params);
  },
  onTogglePlay() {
    playing = !playing;
    panel.setPlaying(playing);
  },
  onStep() {
    if (!sim) return;
    sim.step(1 / 60, params.substeps);
    panel.updateStats(sim.stats());
  },
  onReset() {
    resetScenario();
  },
  onSeedColony() {
    seedColony();
  },
  onExportScreenshot: exportScreenshot,
  onExportParams() {
    downloadText(`physarum-params-${Date.now()}.json`, JSON.stringify(params, null, 2));
  },
  onExportState() {
    if (!sim) return;
    downloadText(`physarum-state-${Date.now()}.json`, sim.exportStateJson());
  },
});

renderer = new Renderer(canvas);

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  canvas.setPointerCapture(event.pointerId);
  applyCanvasTool(event, false);
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointerDown) return;
  applyCanvasTool(event, true);
});

canvas.addEventListener("pointerup", (event) => {
  pointerDown = false;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointerleave", () => {
  pointerDown = false;
});

window.addEventListener("resize", () => renderer.resize());

function frame(now: number): void {
  if (!sim) {
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  if (playing) {
    sim.step(dt, params.substeps);
  }
  if (frames % 8 === 0) {
    const stats = sim.stats();
    panel.updateStats(stats);
    updateHud(stats);
    if (params.showNetwork) {
      network = sim.network();
    }
  }
  renderer.render(sim, network, {
    showAgents: params.showAgents,
    showNetwork: params.showNetwork,
    showShortestPath: params.showShortestPath,
  });
  frames += 1;
  fpsFrames += 1;
  if (now - fpsTimer >= 500) {
    fps = (fpsFrames * 1000) / (now - fpsTimer);
    fpsTimer = now;
    fpsFrames = 0;
  }
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  try {
    sim = await createWasmSimulation(SIM_WIDTH, SIM_HEIGHT, params.randomSeed);
    sim.setParams(params);
    resetScenario();
    panel.setLoadStatus("WASM ready");
    panel.setPlaying(playing);
    requestAnimationFrame((now) => {
      lastFrame = now;
      requestAnimationFrame(frame);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    panel.setLoadStatus(message, true);
    hud.textContent = "WASM failed to load. Build it with npm run build:wasm.";
  }
}

void boot();
