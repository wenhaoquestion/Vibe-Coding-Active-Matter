import { PARAM_GROUPS, createDefaultParams } from "./controls";

describe("controls", () => {
  it("creates defaults with required simulation limits", () => {
    const params = createDefaultParams();
    expect(params.maxAgents).toBeGreaterThanOrEqual(params.targetAgentCount);
    expect(params.energyMax).toBeGreaterThan(params.initialEnergy);
    expect(params.randomSeed).toBeGreaterThan(0);
  });

  it("exposes key user-facing controls", () => {
    const keys = new Set(PARAM_GROUPS.flatMap((group) => group.controls.map((control) => control.key)));
    expect(keys.has("foodCalories")).toBe(true);
    expect(keys.has("baseEnergyCost")).toBe(true);
    expect(keys.has("solverEnabled")).toBe(true);
    expect(keys.has("showShortestPath")).toBe(true);
  });
});
