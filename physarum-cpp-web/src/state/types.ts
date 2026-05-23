export type ToolMode = "inspect" | "slime" | "food" | "erase";
export type PanelTab = "sim" | "energy" | "network" | "formula";

export type AgentMode = 0 | 1 | 2;

export interface AgentView {
  x: number;
  y: number;
  theta: number;
  energy: number;
  mass: number;
  mode: AgentMode;
  alive: boolean;
}

export interface FoodView {
  x: number;
  y: number;
  calories: number;
  radius: number;
  quality: number;
}

export interface NetworkEdgeView {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  conductance: number;
  flow: number;
  path: boolean;
}

export interface Metrics {
  alive: number;
  agents: number;
  foods: number;
  totalBiomass: number;
  avgEnergy: number;
  foodRemaining: number;
  searchCount: number;
  exploitCount: number;
  dormantCount: number;
  pathLength: number;
  transportCost: number;
  dissipation: number;
  backendCode: number;
  fps: number;
  stepsPerSecond: number;
}

export interface SimParams {
  speed: number;
  sensorDistance: number;
  sensorAngle: number;
  turnAngle: number;
  trailDeposit: number;
  trailDecay: number;
  trailDiffuse: number;
  foodCalories: number;
  foodRadius: number;
  foodQuality: number;
  maxEnergy: number;
  baseMetabolism: number;
  moveCost: number;
  searchCost: number;
  eatRate: number;
  eatEfficiency: number;
  growthThreshold: number;
  growthRate: number;
  growthCost: number;
  splitMass: number;
  splitEnergy: number;
  starvationSteps: number;
  networkInterval: number;
  brushRadius: number;
}

export type ParamKey = keyof SimParams;

export interface VisualToggles {
  trail: boolean;
  foodField: boolean;
  agents: boolean;
  directions: boolean;
  network: boolean;
  shortestPath: boolean;
}

export interface SimulatorBackend {
  readonly width: number;
  readonly height: number;
  readonly backendName: string;
  readonly trail: Float32Array;
  readonly foodField: Float32Array;
  readonly agents: AgentView[];
  readonly foods: FoodView[];
  readonly network: NetworkEdgeView[];
  readonly params: SimParams;
  readonly metrics: Metrics;
  reset(seed?: number): void;
  step(steps?: number): void;
  setParam(key: ParamKey, value: number): void;
  addAgents(x: number, y: number, count: number, radius: number, energy?: number): void;
  addFood(x: number, y: number, calories: number, radius: number, quality: number): void;
  erase(x: number, y: number, radius: number): void;
  applyPreset(name: PresetName): void;
}

export type PresetName = "empty" | "twoFoodMaze" | "ringSearch" | "cityNodes" | "denseBloom";
