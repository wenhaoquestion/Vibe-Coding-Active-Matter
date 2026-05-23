import type { EmscriptenModule, ExportedState, NetworkState, SimStats, SimulationParams } from "./types";

type Fn<T extends (...args: never[]) => unknown> = T;

export class WasmSimulation {
  private readonly module: EmscriptenModule;
  private readonly ptr: number;
  private readonly fns: {
    destroy: Fn<(ptr: number) => void>;
    step: Fn<(ptr: number, dt: number, substeps: number) => void>;
    reset: Fn<(ptr: number, seed: number) => void>;
    setParams: Fn<(ptr: number, json: string) => void>;
    addAgents: Fn<(ptr: number, x: number, y: number, count: number, radius: number) => void>;
    addFood: Fn<(ptr: number, x: number, y: number, calories: number, radius: number, strength: number) => void>;
    eraseAt: Fn<
      (
        ptr: number,
        x: number,
        y: number,
        radius: number,
        eraseSlime: number,
        eraseFood: number,
        eraseTrail: number,
        eraseWall: number,
      ) => void
    >;
    addWall: Fn<(ptr: number, x: number, y: number, radius: number) => void>;
    stats: Fn<(ptr: number) => string>;
    renderPtr: Fn<(ptr: number) => number>;
    renderWidth: Fn<(ptr: number) => number>;
    renderHeight: Fn<(ptr: number) => number>;
    agentPtr: Fn<(ptr: number) => number>;
    agentCount: Fn<(ptr: number) => number>;
    network: Fn<(ptr: number) => string>;
    exportState: Fn<(ptr: number) => string>;
    importState: Fn<(ptr: number, json: string) => void>;
  };

  constructor(module: EmscriptenModule, ptr: number) {
    this.module = module;
    this.ptr = ptr;
    this.fns = {
      destroy: module.cwrap("destroySimulation", null, ["number"]) as Fn<(ptr: number) => void>,
      step: module.cwrap("stepSimulation", null, ["number", "number", "number"]) as Fn<
        (ptr: number, dt: number, substeps: number) => void
      >,
      reset: module.cwrap("resetSimulation", null, ["number", "number"]) as Fn<(ptr: number, seed: number) => void>,
      setParams: module.cwrap("setParams", null, ["number", "string"]) as Fn<(ptr: number, json: string) => void>,
      addAgents: module.cwrap("addAgents", null, ["number", "number", "number", "number", "number"]) as Fn<
        (ptr: number, x: number, y: number, count: number, radius: number) => void
      >,
      addFood: module.cwrap("addFood", null, ["number", "number", "number", "number", "number", "number"]) as Fn<
        (ptr: number, x: number, y: number, calories: number, radius: number, strength: number) => void
      >,
      eraseAt: module.cwrap("eraseAt", null, [
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
        "number",
      ]) as Fn<
        (
          ptr: number,
          x: number,
          y: number,
          radius: number,
          eraseSlime: number,
          eraseFood: number,
          eraseTrail: number,
          eraseWall: number,
        ) => void
      >,
      addWall: module.cwrap("addWall", null, ["number", "number", "number", "number"]) as Fn<
        (ptr: number, x: number, y: number, radius: number) => void
      >,
      stats: module.cwrap("getStatsJson", "string", ["number"]) as Fn<(ptr: number) => string>,
      renderPtr: module.cwrap("getRenderBufferPtr", "number", ["number"]) as Fn<(ptr: number) => number>,
      renderWidth: module.cwrap("getRenderBufferWidth", "number", ["number"]) as Fn<(ptr: number) => number>,
      renderHeight: module.cwrap("getRenderBufferHeight", "number", ["number"]) as Fn<(ptr: number) => number>,
      agentPtr: module.cwrap("getAgentBufferPtr", "number", ["number"]) as Fn<(ptr: number) => number>,
      agentCount: module.cwrap("getAgentCount", "number", ["number"]) as Fn<(ptr: number) => number>,
      network: module.cwrap("getNetworkJson", "string", ["number"]) as Fn<(ptr: number) => string>,
      exportState: module.cwrap("exportStateJson", "string", ["number"]) as Fn<(ptr: number) => string>,
      importState: module.cwrap("importStateJson", null, ["number", "string"]) as Fn<(ptr: number, json: string) => void>,
    };
  }

  destroy(): void {
    this.fns.destroy(this.ptr);
  }

  step(dt: number, substeps: number): void {
    this.fns.step(this.ptr, dt, substeps);
  }

  reset(seed: number): void {
    this.fns.reset(this.ptr, seed);
  }

  setParams(params: SimulationParams): void {
    this.fns.setParams(this.ptr, JSON.stringify(params));
  }

  addAgents(x: number, y: number, count: number, radius: number): void {
    this.fns.addAgents(this.ptr, x, y, count, radius);
  }

  addFood(x: number, y: number, calories: number, radius: number, strength: number): void {
    this.fns.addFood(this.ptr, x, y, calories, radius, strength);
  }

  eraseAt(
    x: number,
    y: number,
    radius: number,
    eraseSlime = true,
    eraseFood = true,
    eraseTrail = true,
    eraseWall = true,
  ): void {
    this.fns.eraseAt(
      this.ptr,
      x,
      y,
      radius,
      eraseSlime ? 1 : 0,
      eraseFood ? 1 : 0,
      eraseTrail ? 1 : 0,
      eraseWall ? 1 : 0,
    );
  }

  addWall(x: number, y: number, radius: number): void {
    this.fns.addWall(this.ptr, x, y, radius);
  }

  stats(): SimStats {
    return JSON.parse(this.fns.stats(this.ptr)) as SimStats;
  }

  network(): NetworkState {
    return JSON.parse(this.fns.network(this.ptr)) as NetworkState;
  }

  exportState(): ExportedState {
    return JSON.parse(this.fns.exportState(this.ptr)) as ExportedState;
  }

  exportStateJson(): string {
    return this.fns.exportState(this.ptr);
  }

  importStateJson(json: string): void {
    this.fns.importState(this.ptr, json);
  }

  renderBuffer(): Uint8ClampedArray<ArrayBuffer> {
    const ptr = this.fns.renderPtr(this.ptr);
    const width = this.renderWidth();
    const height = this.renderHeight();
    return new Uint8ClampedArray(this.module.HEAPU8.buffer as ArrayBuffer, ptr, width * height * 4);
  }

  renderWidth(): number {
    return this.fns.renderWidth(this.ptr);
  }

  renderHeight(): number {
    return this.fns.renderHeight(this.ptr);
  }

  agentBuffer(): Float32Array<ArrayBuffer> {
    const count = this.agentCount();
    const ptr = this.fns.agentPtr(this.ptr);
    if (count === 0 || ptr === 0) {
      return new Float32Array();
    }
    return new Float32Array(this.module.HEAPF32.buffer as ArrayBuffer, ptr, count * 5);
  }

  agentCount(): number {
    return this.fns.agentCount(this.ptr);
  }
}

export async function createWasmSimulation(width: number, height: number, seed: number): Promise<WasmSimulation> {
  try {
    const wasmPath = "/wasm/physarum.js";
    const wasmModule = await import(/* @vite-ignore */ wasmPath);
    const factory = wasmModule.default;
    const module = (await factory({
      locateFile: (path: string) => `/wasm/${path}`,
    })) as EmscriptenModule;
    const create = module.cwrap("createSimulation", "number", ["number", "number", "number"]) as (
      w: number,
      h: number,
      s: number,
    ) => number;
    const ptr = create(width, height, seed);
    return new WasmSimulation(module, ptr);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load /wasm/physarum.js. Run "npm run build:wasm" first. Detail: ${detail}`);
  }
}
