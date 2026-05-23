import type { SimulationParams } from "../wasm/types";

export type ToolMode = "slime" | "food" | "erase" | "wall" | "inspect";

export interface ParamControl {
  key: keyof SimulationParams;
  label: string;
  kind: "number" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: number }[];
}

export interface ParamGroup {
  title: string;
  controls: ParamControl[];
}

export function createDefaultParams(): SimulationParams {
  return {
    targetAgentCount: 2500,
    maxAgents: 20000,
    randomSeed: 1337,
    boundaryMode: 1,
    solverEnabled: true,
    showTrail: true,
    showAgents: true,
    showFoodField: false,
    showNetwork: true,
    showShortestPath: true,
    energyMax: 100,
    initialEnergy: 62,
    sensorAngle: 0.62,
    sensorDistance: 9,
    rotationAngle: 0.45,
    speedMin: 8,
    speedMax: 45,
    trailDeposit: 7.5,
    trailDiffusion: 0.12,
    trailDecay: 0.022,
    trailMax: 24,
    trailWeight: 1,
    foodWeight: 2,
    repellentWeight: 3,
    randomSensorNoise: 0.03,
    searchRandomness: 0.38,
    baseEnergyCost: 0.52,
    moveEnergyCost: 0.025,
    sensorEnergyCost: 0.035,
    trailEnergyCost: 0.012,
    eatRate: 24,
    foodEnergyEfficiency: 1.75,
    foodAttractionGamma: 1.8,
    depletedFoodSignal: 0,
    splitEnergyThreshold: 84,
    splitProbability: 0.06,
    splitRatio: 0.48,
    splitAngle: 0.85,
    deathEnergyThreshold: 1,
    deathTime: 8,
    lowEnergyThreshold: 25,
    searchA0: -0.25,
    searchAE: 1.15,
    searchAF: 1.8,
    searchAT: 1.2,
    searchAN: 1.25,
    searchAC: 0.45,
    foodCalories: 700,
    foodRadius: 14,
    attractorStrength: 18,
    brushRadius: 18,
    brushAgents: 150,
    substeps: 2,
    graphStride: 8,
    trailThreshold: 0.85,
    pressureIterations: 80,
    pressureTolerance: 0.00001,
    conductivityAlpha: 1.15,
    conductivityMu: 1,
    conductivityDecay: 0.25,
    conductivityMin: 0.035,
    conductivityMax: 8,
    lambdaEnergy: 0.08,
  };
}

export const TOOL_LABELS: Record<ToolMode, string> = {
  slime: "Add Slime",
  food: "Add Food",
  erase: "Erase",
  wall: "Add Wall",
  inspect: "Inspect",
};

export const PARAM_GROUPS: ParamGroup[] = [
  {
    title: "Population And Food",
    controls: [
      { key: "targetAgentCount", label: "Slime count", kind: "number", min: 1, max: 20000, step: 100 },
      { key: "maxAgents", label: "Max agents", kind: "number", min: 100, max: 50000, step: 100 },
      { key: "randomSeed", label: "Random seed", kind: "number", min: 1, max: 2147483647, step: 1 },
      { key: "brushAgents", label: "Brush agents", kind: "number", min: 1, max: 1000, step: 10 },
      { key: "brushRadius", label: "Brush radius", kind: "number", min: 1, max: 80, step: 1 },
      { key: "foodCalories", label: "Food calories", kind: "number", min: 1, max: 5000, step: 25 },
      { key: "foodRadius", label: "Food radius", kind: "number", min: 2, max: 60, step: 1 },
      { key: "attractorStrength", label: "Attractor strength", kind: "number", min: 0, max: 80, step: 1 },
      {
        key: "boundaryMode",
        label: "Boundary",
        kind: "select",
        options: [
          { label: "Reflect", value: 1 },
          { label: "Wrap", value: 0 },
        ],
      },
    ],
  },
  {
    title: "Chemotaxis",
    controls: [
      { key: "sensorAngle", label: "Sensor angle", kind: "number", min: 0.05, max: 2.4, step: 0.01 },
      { key: "sensorDistance", label: "Sensor distance", kind: "number", min: 1, max: 40, step: 0.5 },
      { key: "rotationAngle", label: "Rotation angle", kind: "number", min: 0.01, max: 2.2, step: 0.01 },
      { key: "trailWeight", label: "Follow trail", kind: "number", min: 0, max: 8, step: 0.05 },
      { key: "foodWeight", label: "Seek food", kind: "number", min: 0, max: 10, step: 0.05 },
      { key: "repellentWeight", label: "Avoid walls", kind: "number", min: 0, max: 12, step: 0.05 },
      { key: "randomSensorNoise", label: "Sensor noise", kind: "number", min: 0, max: 1, step: 0.005 },
      { key: "searchRandomness", label: "Explore randomness", kind: "number", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    title: "Trail Field",
    controls: [
      { key: "trailDeposit", label: "Trail deposit", kind: "number", min: 0, max: 50, step: 0.1 },
      { key: "trailDiffusion", label: "Trail diffusion", kind: "number", min: 0, max: 1, step: 0.005 },
      { key: "trailDecay", label: "Trail decay", kind: "number", min: 0, max: 0.5, step: 0.001 },
      { key: "trailMax", label: "Trail max", kind: "number", min: 1, max: 100, step: 1 },
    ],
  },
  {
    title: "Energy",
    controls: [
      { key: "energyMax", label: "Energy max", kind: "number", min: 5, max: 500, step: 1 },
      { key: "initialEnergy", label: "Initial energy", kind: "number", min: 0, max: 500, step: 1 },
      { key: "speedMin", label: "Min speed", kind: "number", min: 0, max: 80, step: 0.5 },
      { key: "speedMax", label: "Max speed", kind: "number", min: 0, max: 160, step: 0.5 },
      { key: "baseEnergyCost", label: "Base cost", kind: "number", min: 0, max: 10, step: 0.01 },
      { key: "moveEnergyCost", label: "Move cost", kind: "number", min: 0, max: 1, step: 0.001 },
      { key: "sensorEnergyCost", label: "Sensor cost", kind: "number", min: 0, max: 1, step: 0.001 },
      { key: "trailEnergyCost", label: "Trail cost", kind: "number", min: 0, max: 1, step: 0.001 },
      { key: "eatRate", label: "Eat rate", kind: "number", min: 0, max: 500, step: 1 },
      { key: "foodEnergyEfficiency", label: "Food efficiency", kind: "number", min: 0, max: 10, step: 0.05 },
      { key: "foodAttractionGamma", label: "Hunger gamma", kind: "number", min: 0.1, max: 6, step: 0.05 },
    ],
  },
  {
    title: "Growth And Death",
    controls: [
      { key: "splitEnergyThreshold", label: "Split threshold", kind: "number", min: 1, max: 500, step: 1 },
      { key: "splitProbability", label: "Split probability", kind: "number", min: 0, max: 2, step: 0.005 },
      { key: "splitRatio", label: "Split ratio", kind: "number", min: 0.05, max: 0.95, step: 0.01 },
      { key: "splitAngle", label: "Split angle", kind: "number", min: 0, max: 3.14, step: 0.01 },
      { key: "lowEnergyThreshold", label: "Dormancy energy", kind: "number", min: 0, max: 300, step: 1 },
      { key: "deathEnergyThreshold", label: "Death energy", kind: "number", min: 0, max: 50, step: 0.5 },
      { key: "deathTime", label: "Death time", kind: "number", min: 0, max: 120, step: 0.5 },
    ],
  },
  {
    title: "Search Decision",
    controls: [
      { key: "searchA0", label: "a0", kind: "number", min: -8, max: 8, step: 0.05 },
      { key: "searchAE", label: "aE energy", kind: "number", min: -8, max: 8, step: 0.05 },
      { key: "searchAF", label: "aF food", kind: "number", min: -8, max: 8, step: 0.05 },
      { key: "searchAT", label: "aT trail", kind: "number", min: -8, max: 8, step: 0.05 },
      { key: "searchAN", label: "aN novelty", kind: "number", min: -8, max: 8, step: 0.05 },
      { key: "searchAC", label: "aC cost", kind: "number", min: -8, max: 8, step: 0.05 },
    ],
  },
  {
    title: "Network Solver",
    controls: [
      { key: "solverEnabled", label: "Enable solver", kind: "boolean" },
      { key: "graphStride", label: "Graph stride", kind: "number", min: 3, max: 32, step: 1 },
      { key: "trailThreshold", label: "Trail threshold", kind: "number", min: 0, max: 20, step: 0.05 },
      { key: "pressureIterations", label: "Pressure iterations", kind: "number", min: 1, max: 300, step: 1 },
      { key: "pressureTolerance", label: "Pressure tolerance", kind: "number", min: 0.000001, max: 0.01, step: 0.000001 },
      { key: "conductivityAlpha", label: "Conductivity alpha", kind: "number", min: 0, max: 8, step: 0.05 },
      { key: "conductivityMu", label: "Conductivity mu", kind: "number", min: 0.1, max: 4, step: 0.05 },
      { key: "conductivityDecay", label: "Conductivity decay", kind: "number", min: 0, max: 4, step: 0.01 },
      { key: "conductivityMin", label: "Conductivity min", kind: "number", min: 0.001, max: 1, step: 0.001 },
      { key: "conductivityMax", label: "Conductivity max", kind: "number", min: 0.1, max: 50, step: 0.1 },
      { key: "lambdaEnergy", label: "Path energy weight", kind: "number", min: 0, max: 2, step: 0.01 },
    ],
  },
  {
    title: "Render",
    controls: [
      { key: "showTrail", label: "Show trail", kind: "boolean" },
      { key: "showAgents", label: "Show agents", kind: "boolean" },
      { key: "showFoodField", label: "Show food field", kind: "boolean" },
      { key: "showNetwork", label: "Show network", kind: "boolean" },
      { key: "showShortestPath", label: "Show shortest path", kind: "boolean" },
      { key: "depletedFoodSignal", label: "Depleted signal", kind: "number", min: 0, max: 1, step: 0.01 },
      { key: "substeps", label: "Substeps", kind: "number", min: 1, max: 12, step: 1 },
    ],
  },
];
