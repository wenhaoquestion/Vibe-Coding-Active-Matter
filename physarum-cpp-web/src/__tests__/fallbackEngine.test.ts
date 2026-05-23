import { describe, expect, it } from "vitest";
import { FallbackPhysarumEngine } from "../wasm/fallbackEngine";

describe("FallbackPhysarumEngine", () => {
  it("consumes food and restores agent energy", () => {
    const sim = new FallbackPhysarumEngine(96, 72, 2);
    sim.applyPreset("empty");
    sim.setParam("eatRate", 1.2);
    sim.addFood(48, 36, 100, 12, 1);
    sim.addAgents(48, 36, 1, 0, 20);
    sim.step(20);
    expect(sim.agents[0].energy).toBeGreaterThan(20);
    expect(sim.metrics.foodRemaining).toBeLessThan(100);
  });

  it("makes search more likely under weak signal than strong signal", () => {
    const sim = new FallbackPhysarumEngine(64, 64, 3);
    expect(sim.searchProbability(80, 0.02)).toBeGreaterThan(sim.searchProbability(80, 3));
    expect(sim.searchProbability(80, 0.02)).toBeGreaterThanOrEqual(0);
    expect(sim.searchProbability(80, 0.02)).toBeLessThanOrEqual(1);
  });

  it("builds a nutrient path graph", () => {
    const sim = new FallbackPhysarumEngine(120, 80, 4);
    sim.applyPreset("empty");
    sim.addFood(18, 20, 400, 10, 1);
    sim.addFood(100, 60, 400, 10, 1);
    sim.addAgents(50, 40, 120, 10, 82);
    sim.step(40);
    expect(sim.network.length).toBeGreaterThan(0);
    expect(sim.metrics.pathLength).toBeGreaterThan(0);
  });
});
