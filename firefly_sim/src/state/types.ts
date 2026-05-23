export type FlashMode = 'binary' | 'cosine' | 'spike';
export type ToolMode = 'inspect' | 'add' | 'erase' | 'obstacle' | 'city' | 'bat';
export type ScanKind = 'K' | 'R_visual' | 'D' | 'chi_bat' | 'batCount';

export interface SimParams {
  N: number;
  L: number;
  K: number;
  R_visual: number;
  D: number;
  omega0: number;
  sigma_omega: number;
  dt: number;
  speed: number;
  sigma_flash: number;
  flashMode: FlashMode;
  epsilon_city: number;
  Omega_city: number;
  phi_city: number;
  obstacleRadius: number;
  blockVisibility: boolean;
  speciesMode: 1 | 2;
  omega_A: number;
  omega_B: number;
  K_in: number;
  K_out: number;
  mobilityEnabled: boolean;
  v_firefly: number;
  D_turn: number;
  D_move: number;
  R_avoid: number;
  chi_bat: number;
  predationEnabled: boolean;
  batCount: number;
  v_bat: number;
  R_bat_perception: number;
  R_capture: number;
  batTurnNoise: number;
}

export interface Metrics {
  r: number;
  psi: number;
  rLocalMean: number;
  avgNeighbors: number;
  isolatedCount: number;
  flashCount: number;
  cityLockDelta: number;
  rA: number;
  rB: number;
  aliveCount: number;
  capturedCount: number;
  meanPanic: number;
  meanNearestBatDistance: number;
  batTargetCount: number;
}

export interface FireflyView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speed: number;
  theta: number;
  omega: number;
  brightness: number;
  localOrder: number;
  panic: number;
  neighborCount: number;
  species: number;
  alive: number;
}

export interface ObstacleView {
  x: number;
  y: number;
  radius: number;
}

export interface CityLightView {
  x: number;
  y: number;
  radius: number;
  epsilon: number;
  omega: number;
  phase: number;
}

export interface BatView {
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  speed: number;
  perceptionRadius: number;
  captureRadius: number;
  targetIndex: number;
  hunger: number;
}

export interface ScanPoint {
  value: number;
  rBar: number;
}

export interface SimSnapshot {
  mode: 'wasm' | 'fallback';
  time: number;
  fireflies: FireflyView[];
  obstacles: ObstacleView[];
  cityLights: CityLightView[];
  bats: BatView[];
  metrics: Metrics;
  timeSeries: Metrics[];
  scanResults: ScanPoint[];
  estimatedKc: number | null;
}

export interface FireflyAdapter {
  readonly mode: 'wasm' | 'fallback';
  init(width: number, height: number, seed: number, params: SimParams): Promise<void>;
  reset(seed: number, params: SimParams): void;
  step(steps: number): void;
  setParams(params: SimParams): void;
  addFireflies(x: number, y: number, count: number, radius: number): void;
  eraseFireflies(x: number, y: number, radius: number): void;
  addObstacle(x: number, y: number, radius: number): void;
  clearObstacles(): void;
  addCityLight(x: number, y: number, radius: number, epsilon: number, omega: number): void;
  clearCityLights(): void;
  addBat(x: number, y: number): void;
  clearBats(): void;
  runScan(kind: ScanKind, min: number, max: number, samples: number, steps: number, burnIn: number, threshold: number): ScanPoint[];
  getSnapshot(): SimSnapshot;
}
