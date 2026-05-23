import { defaultParams, paramIds } from '../state/presets';
import type { FireflyAdapter, Metrics, ScanKind, ScanPoint, SimParams, SimSnapshot } from '../state/types';
import { FallbackFireflyAdapter } from './fallback';

type WasmExports = {
  HEAPF32: Float32Array;
  _sim_init(width: number, height: number, seed: number): void;
  _sim_reset(seed: number): void;
  _sim_step(steps: number): void;
  _sim_set_param(paramId: number, value: number): void;
  _sim_add_fireflies(x: number, y: number, count: number, radius: number): void;
  _sim_erase_fireflies(x: number, y: number, radius: number): void;
  _sim_add_obstacle(x: number, y: number, radius: number): void;
  _sim_erase_obstacles(x: number, y: number, radius: number): void;
  _sim_clear_obstacles(): void;
  _sim_add_city_light(x: number, y: number, radius: number, epsilon: number, omega: number): void;
  _sim_erase_city_lights(x: number, y: number, radius: number): void;
  _sim_clear_city_lights(): void;
  _sim_add_bat(x: number, y: number): void;
  _sim_erase_bats(x: number, y: number, radius: number): void;
  _sim_clear_bats(): void;
  _sim_run_scan(kind: number, min: number, max: number, samples: number, steps: number, burnIn: number, threshold: number): void;
  _sim_get_firefly_count(): number;
  _sim_get_obstacle_count(): number;
  _sim_get_city_light_count(): number;
  _sim_get_bat_count(): number;
  _sim_get_time_series_count(): number;
  _sim_get_scan_count(): number;
  _sim_get_estimated_kc(): number;
  _sim_get_time(): number;
  _sim_get_firefly_ptr(): number;
  _sim_get_obstacle_ptr(): number;
  _sim_get_city_light_ptr(): number;
  _sim_get_bat_ptr(): number;
  _sim_get_metrics_ptr(): number;
  _sim_get_time_series_ptr(): number;
  _sim_get_scan_results_ptr(): number;
};

type WasmFactory = () => Promise<WasmExports>;

const metricKeys: Array<keyof Metrics> = [
  'r',
  'psi',
  'rLocalMean',
  'avgNeighbors',
  'isolatedCount',
  'flashCount',
  'cityLockDelta',
  'rA',
  'rB',
  'aliveCount',
  'capturedCount',
  'meanPanic',
  'meanNearestBatDistance',
  'batTargetCount'
];

class WasmFireflyAdapter implements FireflyAdapter {
  readonly mode = 'wasm' as const;
  private wasm: WasmExports;
  private params: SimParams = defaultParams;

  constructor(wasm: WasmExports) {
    this.wasm = wasm;
  }

  async init(width: number, height: number, seed: number, params: SimParams): Promise<void> {
    this.params = { ...params };
    this.wasm._sim_init(width, height, seed);
    this.setParams(params);
    this.wasm._sim_reset(seed);
  }

  reset(seed: number, params: SimParams): void {
    this.params = { ...params };
    this.setParams(params);
    this.wasm._sim_reset(seed);
  }

  step(steps: number): void {
    this.wasm._sim_step(steps);
  }

  setParams(params: SimParams): void {
    this.params = { ...params };
    for (const [name, paramId] of Object.entries(paramIds)) {
      const key = name as keyof SimParams;
      const value = params[key];
      if (typeof value === 'number') this.wasm._sim_set_param(paramId, value);
      if (typeof value === 'boolean') this.wasm._sim_set_param(paramId, value ? 1 : 0);
      if (key === 'flashMode') this.wasm._sim_set_param(paramId, value === 'binary' ? 0 : value === 'cosine' ? 1 : 2);
    }
  }

  addFireflies(x: number, y: number, count: number, radius: number): void {
    this.wasm._sim_add_fireflies(x, y, count, radius);
  }

  eraseFireflies(x: number, y: number, radius: number): void {
    this.wasm._sim_erase_fireflies(x, y, radius);
  }

  addObstacle(x: number, y: number, radius: number): void {
    this.wasm._sim_add_obstacle(x, y, radius);
  }

  eraseObstacles(x: number, y: number, radius: number): void {
    this.wasm._sim_erase_obstacles(x, y, radius);
  }

  clearObstacles(): void {
    this.wasm._sim_clear_obstacles();
  }

  addCityLight(x: number, y: number, radius: number, epsilon: number, omega: number): void {
    this.wasm._sim_add_city_light(x, y, radius, epsilon, omega);
  }

  eraseCityLights(x: number, y: number, radius: number): void {
    this.wasm._sim_erase_city_lights(x, y, radius);
  }

  clearCityLights(): void {
    this.wasm._sim_clear_city_lights();
  }

  addBat(x: number, y: number): void {
    this.wasm._sim_add_bat(x, y);
  }

  eraseBats(x: number, y: number, radius: number): void {
    this.wasm._sim_erase_bats(x, y, radius);
  }

  clearBats(): void {
    this.wasm._sim_clear_bats();
  }

  runScan(kind: ScanKind, min: number, max: number, samples: number, steps: number, burnIn: number, threshold: number): ScanPoint[] {
    const kindId = kind === 'K' ? 0 : kind === 'R_visual' ? 1 : kind === 'D' ? 2 : kind === 'chi_bat' ? 3 : 4;
    this.wasm._sim_run_scan(kindId, min, max, samples, steps, burnIn, threshold);
    return this.readScanResults();
  }

  getSnapshot(): SimSnapshot {
    return {
      mode: this.mode,
      time: this.wasm._sim_get_time(),
      fireflies: this.readFireflies(),
      obstacles: this.readObstacles(),
      cityLights: this.readCityLights(),
      bats: this.readBats(),
      metrics: this.readMetrics(this.wasm._sim_get_metrics_ptr()),
      timeSeries: this.readHistory(),
      scanResults: this.readScanResults(),
      estimatedKc: this.wasm._sim_get_estimated_kc() >= 0 ? this.wasm._sim_get_estimated_kc() : null
    };
  }

  private readFireflies() {
    const count = this.wasm._sim_get_firefly_count();
    const start = this.wasm._sim_get_firefly_ptr() / 4;
    const heap = this.wasm.HEAPF32;
    return Array.from({ length: count }, (_, i) => {
      const off = start + i * 14;
      return {
        x: heap[off],
        y: heap[off + 1],
        vx: heap[off + 2],
        vy: heap[off + 3],
        heading: heap[off + 4],
        speed: heap[off + 5],
        theta: heap[off + 6],
        omega: heap[off + 7],
        brightness: heap[off + 8],
        localOrder: heap[off + 9],
        panic: heap[off + 10],
        neighborCount: heap[off + 11],
        species: heap[off + 12],
        alive: heap[off + 13]
      };
    });
  }

  private readObstacles() {
    const count = this.wasm._sim_get_obstacle_count();
    const start = this.wasm._sim_get_obstacle_ptr() / 4;
    const heap = this.wasm.HEAPF32;
    return Array.from({ length: count }, (_, i) => ({ x: heap[start + i * 3], y: heap[start + i * 3 + 1], radius: heap[start + i * 3 + 2] }));
  }

  private readCityLights() {
    const count = this.wasm._sim_get_city_light_count();
    const start = this.wasm._sim_get_city_light_ptr() / 4;
    const heap = this.wasm.HEAPF32;
    return Array.from({ length: count }, (_, i) => ({
      x: heap[start + i * 6],
      y: heap[start + i * 6 + 1],
      radius: heap[start + i * 6 + 2],
      epsilon: heap[start + i * 6 + 3],
      omega: heap[start + i * 6 + 4],
      phase: heap[start + i * 6 + 5]
    }));
  }

  private readBats() {
    const count = this.wasm._sim_get_bat_count();
    const start = this.wasm._sim_get_bat_ptr() / 4;
    const heap = this.wasm.HEAPF32;
    return Array.from({ length: count }, (_, i) => ({
      x: heap[start + i * 10],
      y: heap[start + i * 10 + 1],
      vx: heap[start + i * 10 + 2],
      vy: heap[start + i * 10 + 3],
      heading: heap[start + i * 10 + 4],
      speed: heap[start + i * 10 + 5],
      perceptionRadius: heap[start + i * 10 + 6],
      captureRadius: heap[start + i * 10 + 7],
      targetIndex: heap[start + i * 10 + 8],
      hunger: heap[start + i * 10 + 9]
    }));
  }

  private readMetrics(ptr: number): Metrics {
    const start = ptr / 4;
    const values = this.wasm.HEAPF32;
    return metricKeys.reduce((metrics, key, index) => ({ ...metrics, [key]: values[start + index] }), {} as Metrics);
  }

  private readHistory(): Metrics[] {
    const count = this.wasm._sim_get_time_series_count();
    const ptr = this.wasm._sim_get_time_series_ptr();
    return Array.from({ length: count }, (_, i) => this.readMetrics(ptr + i * metricKeys.length * 4));
  }

  private readScanResults(): ScanPoint[] {
    const count = this.wasm._sim_get_scan_count();
    const start = this.wasm._sim_get_scan_results_ptr() / 4;
    const heap = this.wasm.HEAPF32;
    return Array.from({ length: count }, (_, i) => ({ value: heap[start + i * 2], rBar: heap[start + i * 2 + 1] }));
  }
}

export async function createFireflyAdapter(params: SimParams): Promise<FireflyAdapter> {
  try {
    const wasmModulePath = '/wasm/firefly.js';
    const mod = (await import(/* @vite-ignore */ wasmModulePath)) as { default: WasmFactory };
    return new WasmFireflyAdapter(await mod.default());
  } catch (error) {
    console.info('Using JavaScript fallback simulation. Run npm run build:wasm after installing Emscripten for the C++ core.', error);
    return new FallbackFireflyAdapter(params);
  }
}
