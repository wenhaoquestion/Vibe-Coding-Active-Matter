import type { PresetName, SimParams, VisualToggles } from "./types";

export const defaultParams: SimParams = {
  speed: 1.35,
  sensorDistance: 9,
  sensorAngle: 0.62,
  turnAngle: 0.32,
  trailDeposit: 0.34,
  trailDecay: 0.042,
  trailDiffuse: 0.24,
  foodCalories: 520,
  foodRadius: 13,
  foodQuality: 1,
  maxEnergy: 100,
  baseMetabolism: 0.018,
  moveCost: 0.009,
  searchCost: 0.018,
  eatRate: 0.38,
  eatEfficiency: 2.5,
  growthThreshold: 0.72,
  growthRate: 0.016,
  growthCost: 16,
  splitMass: 2.2,
  splitEnergy: 78,
  starvationSteps: 420,
  networkInterval: 18,
  brushRadius: 18
};

export const defaultToggles: VisualToggles = {
  trail: true,
  foodField: true,
  agents: true,
  directions: false,
  network: true,
  shortestPath: true
};

export const presetLabels: Record<PresetName, string> = {
  empty: "Empty",
  twoFoodMaze: "Two Food Maze",
  ringSearch: "Ring Search",
  cityNodes: "City Nodes",
  denseBloom: "Dense Bloom"
};

export const formulaSnippets = [
  {
    label: "Food attractant",
    tex: String.raw`A_t(x,y)=\sum_k q_k\frac{C_k}{C_k+C_{1/2}+\varepsilon}\exp\left(-\frac{\|(x,y)-f_k\|^2}{2\sigma_{A,k}^2}\right)`
  },
  {
    label: "Trail field",
    tex: String.raw`T_{t+\Delta t}=(1-\lambda_T\Delta t)\left(G_{\sigma_T}*(T_t+D_t)\right)`
  },
  {
    label: "Search probability",
    tex: String.raw`P_i^{search}=\sigma\left(k_E\left[\frac{E_i}{E_{max}}-\theta_d\right]\right)\left(1-\sigma\left(k_S[S_i^{max}-\tau_S]\right)\right)`
  },
  {
    label: "Energy budget",
    tex: String.raw`\hat E_i=\operatorname{clip}\left(E_i+\eta_E\sum_kG_{ik}-L_i,0,E_{max}\right)`
  },
  {
    label: "Growth",
    tex: String.raw`\Delta m_i=r_g\left[\frac{\hat E_i}{E_{max}}-\theta_g\right]_+m_i\Delta t`
  },
  {
    label: "Adaptive conductance",
    tex: String.raw`D_e(t+\Delta t)=\max\left(D_{min},D_e+\Delta t\left[\alpha_D\frac{|Q_e|^\gamma}{|Q_e|^\gamma+q_0^\gamma+\varepsilon}-\mu_DD_e\right]\right)`
  }
];
