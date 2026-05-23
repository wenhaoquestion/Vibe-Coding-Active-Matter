import { PARAM_GROUPS, TOOL_LABELS, type ToolMode } from "./controls";
import type { SimStats, SimulationParams } from "../wasm/types";

interface PanelCallbacks {
  onToolChange: (tool: ToolMode) => void;
  onParamsChange: (params: SimulationParams) => void;
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: () => void;
  onSeedColony: () => void;
  onExportScreenshot: () => void;
  onExportParams: () => void;
  onExportState: () => void;
}

export interface PanelApi {
  setPlaying: (playing: boolean) => void;
  setTool: (tool: ToolMode) => void;
  setLoadStatus: (text: string, failed?: boolean) => void;
  setInspectText: (text: string) => void;
  updateStats: (stats: SimStats) => void;
}

function button(label: string, title: string): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  el.title = title;
  return el;
}

function metricValue(value: number, digits = 2): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function createPanel(
  root: HTMLElement,
  params: SimulationParams,
  initialTool: ToolMode,
  callbacks: PanelCallbacks,
): PanelApi {
  root.replaceChildren();

  const header = document.createElement("header");
  header.className = "panel-header";
  const title = document.createElement("h1");
  title.textContent = "Physarum Lab";
  const subtitle = document.createElement("p");
  subtitle.textContent = "Energy-aware slime mold network simulation";
  header.append(title, subtitle);

  const status = document.createElement("div");
  status.className = "load-status";
  status.textContent = "Loading WASM...";

  const toolBlock = document.createElement("section");
  toolBlock.className = "tool-block";
  const toolTitle = document.createElement("h2");
  toolTitle.textContent = "Tools";
  const toolGrid = document.createElement("div");
  toolGrid.className = "tool-grid";
  const toolButtons = new Map<ToolMode, HTMLButtonElement>();
  (Object.keys(TOOL_LABELS) as ToolMode[]).forEach((tool) => {
    const el = button(TOOL_LABELS[tool], TOOL_LABELS[tool]);
    el.className = "tool-button";
    el.dataset.tool = tool;
    el.addEventListener("click", () => {
      callbacks.onToolChange(tool);
      setTool(tool);
    });
    toolButtons.set(tool, el);
    toolGrid.append(el);
  });
  toolBlock.append(toolTitle, toolGrid);

  const simActions = document.createElement("section");
  simActions.className = "action-block";
  const playButton = button("Pause", "Pause or resume");
  const stepButton = button("Step", "Advance one frame");
  const resetButton = button("Reset", "Reset scenario");
  const seedButton = button("Seed Colony", "Create the requested slime count at the center");
  const screenshotButton = button("Export PNG", "Export current canvas screenshot");
  const paramsButton = button("Export Params", "Export current parameter JSON");
  const stateButton = button("Export State", "Export current agents and food");
  playButton.addEventListener("click", callbacks.onTogglePlay);
  stepButton.addEventListener("click", callbacks.onStep);
  resetButton.addEventListener("click", callbacks.onReset);
  seedButton.addEventListener("click", callbacks.onSeedColony);
  screenshotButton.addEventListener("click", callbacks.onExportScreenshot);
  paramsButton.addEventListener("click", callbacks.onExportParams);
  stateButton.addEventListener("click", callbacks.onExportState);
  simActions.append(playButton, stepButton, resetButton, seedButton, screenshotButton, paramsButton, stateButton);

  const metrics = document.createElement("section");
  metrics.className = "metrics";
  const metricsTitle = document.createElement("h2");
  metricsTitle.textContent = "Metrics";
  const metricsGrid = document.createElement("dl");
  const metricKeys: Array<[keyof SimStats, string, number]> = [
    ["liveAgents", "Alive", 0],
    ["averageEnergy", "Avg energy", 2],
    ["foodRemaining", "Food left", 1],
    ["totalTrail", "Trail", 0],
    ["coverage", "Coverage", 3],
    ["averageSearchProbability", "Avg P_search", 3],
    ["searchRatio", "Search", 3],
    ["exploitRatio", "Exploit", 3],
    ["totalNetworkLength", "Network length", 1],
    ["transportCost", "Transport cost", 2],
    ["efficiency", "Efficiency", 3],
    ["averageShortestPath", "Avg shortest", 2],
    ["networkNodes", "Graph nodes", 0],
    ["activeNetworkEdges", "Active edges", 0],
  ];
  const metricOutputs = new Map<keyof SimStats, HTMLElement>();
  for (const [key, label] of metricKeys) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = "0";
    metricOutputs.set(key, dd);
    metricsGrid.append(dt, dd);
  }
  metrics.append(metricsTitle, metricsGrid);

  const inspect = document.createElement("section");
  inspect.className = "inspect";
  const inspectTitle = document.createElement("h2");
  inspectTitle.textContent = "Inspect";
  const inspectText = document.createElement("pre");
  inspectText.textContent = "Click the canvas with Inspect selected.";
  inspect.append(inspectTitle, inspectText);

  const paramsWrap = document.createElement("section");
  paramsWrap.className = "params";
  const paramsTitle = document.createElement("h2");
  paramsTitle.textContent = "Parameters";
  paramsWrap.append(paramsTitle);
  for (const group of PARAM_GROUPS) {
    const details = document.createElement("details");
    details.open = ["Population And Food", "Chemotaxis", "Energy", "Render"].includes(group.title);
    const summary = document.createElement("summary");
    summary.textContent = group.title;
    details.append(summary);
    const grid = document.createElement("div");
    grid.className = "control-grid";
    for (const control of group.controls) {
      const label = document.createElement("label");
      label.className = control.kind === "boolean" ? "control-row checkbox-row" : "control-row";
      const span = document.createElement("span");
      span.textContent = control.label;
      let input: HTMLInputElement | HTMLSelectElement;
      if (control.kind === "select") {
        const select = document.createElement("select");
        for (const option of control.options ?? []) {
          const opt = document.createElement("option");
          opt.value = String(option.value);
          opt.textContent = option.label;
          select.append(opt);
        }
        select.value = String(params[control.key]);
        input = select;
      } else {
        const el = document.createElement("input");
        el.type = control.kind === "boolean" ? "checkbox" : "number";
        if (control.kind === "boolean") {
          el.checked = Boolean(params[control.key]);
        } else {
          el.value = String(params[control.key]);
          if (control.min !== undefined) el.min = String(control.min);
          if (control.max !== undefined) el.max = String(control.max);
          if (control.step !== undefined) el.step = String(control.step);
        }
        input = el;
      }
      input.addEventListener("input", () => {
        const current = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : Number(input.value);
        (params as unknown as Record<string, number | boolean>)[control.key] = current;
        callbacks.onParamsChange(params);
      });
      label.append(span, input);
      grid.append(label);
    }
    details.append(grid);
    paramsWrap.append(details);
  }

  root.append(header, status, toolBlock, simActions, metrics, inspect, paramsWrap);

  function setPlaying(playing: boolean): void {
    playButton.textContent = playing ? "Pause" : "Play";
  }

  function setTool(tool: ToolMode): void {
    for (const [key, el] of toolButtons) {
      el.classList.toggle("active", key === tool);
    }
  }

  setTool(initialTool);

  return {
    setPlaying,
    setTool,
    setLoadStatus(text: string, failed = false) {
      status.textContent = text;
      status.classList.toggle("failed", failed);
    },
    setInspectText(text: string) {
      inspectText.textContent = text;
    },
    updateStats(stats: SimStats) {
      for (const [key, , digits] of metricKeys) {
        const el = metricOutputs.get(key);
        if (el) {
          el.textContent = metricValue(Number(stats[key]), digits);
        }
      }
    },
  };
}
