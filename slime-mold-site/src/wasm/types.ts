export interface SimulationParams {
  targetAgentCount: number;
  maxAgents: number;
  randomSeed: number;
  boundaryMode: number;
  solverEnabled: boolean;
  showTrail: boolean;
  showAgents: boolean;
  showFoodField: boolean;
  showNetwork: boolean;
  showShortestPath: boolean;
  energyMax: number;
  initialEnergy: number;
  sensorAngle: number;
  sensorDistance: number;
  rotationAngle: number;
  speedMin: number;
  speedMax: number;
  trailDeposit: number;
  trailDiffusion: number;
  trailDecay: number;
  trailMax: number;
  trailWeight: number;
  foodWeight: number;
  repellentWeight: number;
  randomSensorNoise: number;
  searchRandomness: number;
  baseEnergyCost: number;
  moveEnergyCost: number;
  sensorEnergyCost: number;
  trailEnergyCost: number;
  eatRate: number;
  foodEnergyEfficiency: number;
  foodAttractionGamma: number;
  depletedFoodSignal: number;
  splitEnergyThreshold: number;
  splitProbability: number;
  splitRatio: number;
  splitAngle: number;
  deathEnergyThreshold: number;
  deathTime: number;
  lowEnergyThreshold: number;
  searchA0: number;
  searchAE: number;
  searchAF: number;
  searchAT: number;
  searchAN: number;
  searchAC: number;
  foodCalories: number;
  foodRadius: number;
  attractorStrength: number;
  brushRadius: number;
  brushAgents: number;
  substeps: number;
  graphStride: number;
  trailThreshold: number;
  pressureIterations: number;
  pressureTolerance: number;
  conductivityAlpha: number;
  conductivityMu: number;
  conductivityDecay: number;
  conductivityMin: number;
  conductivityMax: number;
  lambdaEnergy: number;
}

export interface SimStats {
  time: number;
  liveAgents: number;
  totalAgents: number;
  averageEnergy: number;
  foodRemaining: number;
  totalTrail: number;
  coverage: number;
  averageSearchProbability: number;
  searchRatio: number;
  exploitRatio: number;
  totalNetworkLength: number;
  transportCost: number;
  deliveredNutrients: number;
  efficiency: number;
  averageShortestPath: number;
  networkNodes: number;
  networkEdges: number;
  activeNetworkEdges: number;
}

export interface NetworkNode {
  id: number;
  x: number;
  y: number;
  pressure: number;
  food: boolean;
  sink: boolean;
}

export interface NetworkEdge {
  a: number;
  b: number;
  length: number;
  conductivity: number;
  flow: number;
  shortest: boolean;
}

export interface NetworkState {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  metrics?: Record<string, number>;
}

export interface ExportedAgent {
  id: number;
  x: number;
  y: number;
  angle: number;
  energy: number;
  search: boolean;
}

export interface ExportedFood {
  id: number;
  x: number;
  y: number;
  radius: number;
  calories: number;
  maxCalories: number;
  attractorStrength: number;
  enabled: boolean;
}

export interface ExportedState {
  width: number;
  height: number;
  time: number;
  seed: number;
  agents: ExportedAgent[];
  foods: ExportedFood[];
}

export interface EmscriptenModule {
  HEAPU8: Uint8Array<ArrayBuffer>;
  HEAPF32: Float32Array<ArrayBuffer>;
  cwrap: (name: string, returnType: string | null, argTypes: string[]) => (...args: unknown[]) => unknown;
}
