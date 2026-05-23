import { describe, expect, it } from 'vitest';
import { defaultParams } from '../state/presets';
import { FallbackFireflyAdapter } from '../wasm/fallback';

describe('fallback firefly adapter', () => {
  it('initializes, steps, and exposes metrics', async () => {
    const adapter = new FallbackFireflyAdapter({ ...defaultParams, N: 80 });
    await adapter.init(800, 600, 7, { ...defaultParams, N: 80 });
    const before = adapter.getSnapshot();
    adapter.step(10);
    const after = adapter.getSnapshot();
    expect(after.fireflies).toHaveLength(80);
    expect(after.time).toBeGreaterThan(before.time);
    expect(after.metrics.r).toBeGreaterThanOrEqual(0);
    expect(after.metrics.r).toBeLessThanOrEqual(1);
  });

  it('adds obstacles and scan results', async () => {
    const adapter = new FallbackFireflyAdapter({ ...defaultParams, N: 40 });
    await adapter.init(800, 600, 11, { ...defaultParams, N: 40 });
    adapter.addObstacle(4, 4, 1);
    const scan = adapter.runScan('K', 0, 2, 4, 30, 10, 0.4);
    expect(adapter.getSnapshot().obstacles).toHaveLength(1);
    expect(scan).toHaveLength(4);
  });

  it('moves fireflies in bounds and exposes bat capture metrics', async () => {
    const params = { ...defaultParams, N: 12, mobilityEnabled: true, v_firefly: 1, batCount: 1, R_capture: 0.4, R_avoid: 2 };
    const adapter = new FallbackFireflyAdapter(params);
    await adapter.init(800, 600, 13, params);
    const initial = adapter.getSnapshot();
    adapter.addBat(initial.fireflies[0].x, initial.fireflies[0].y);
    adapter.step(20);
    const after = adapter.getSnapshot();
    expect(after.bats.length).toBeGreaterThan(0);
    expect(after.fireflies.every((f) => f.x >= 0 && f.x <= params.L && f.y >= 0 && f.y <= params.L)).toBe(true);
    expect(after.metrics.meanPanic).toBeGreaterThanOrEqual(0);
    expect(after.metrics.capturedCount).toBeGreaterThanOrEqual(0);
  });

  it('suppresses brightness and phase updates inside bat perception radius', async () => {
    const params = { ...defaultParams, N: 1, mobilityEnabled: false, predationEnabled: false, v_bat: 0, R_bat_perception: 3 };
    const adapter = new FallbackFireflyAdapter(params);
    await adapter.init(800, 600, 23, params);
    const initial = adapter.getSnapshot();
    adapter.addBat(initial.fireflies[0].x, initial.fireflies[0].y);
    adapter.step(1);
    const after = adapter.getSnapshot();
    expect(after.fireflies[0].theta).toBe(initial.fireflies[0].theta);
    expect(after.fireflies[0].brightness).toBe(0);
  });

  it('keeps unchased fireflies stationary unless bat pressure forces movement', async () => {
    const stillParams = { ...defaultParams, N: 1, mobilityEnabled: true, moveProbability: 0, D_turn: 0, D_move: 0, v_firefly: 1 };
    const still = new FallbackFireflyAdapter(stillParams);
    await still.init(800, 600, 29, stillParams);
    const beforeStill = still.getSnapshot().fireflies[0];
    still.step(5);
    const afterStill = still.getSnapshot().fireflies[0];
    expect(afterStill.x).toBe(beforeStill.x);
    expect(afterStill.y).toBe(beforeStill.y);

    const chasedParams = { ...stillParams, predationEnabled: false, v_bat: 0, R_bat_perception: 3 };
    const chased = new FallbackFireflyAdapter(chasedParams);
    await chased.init(800, 600, 30, chasedParams);
    const beforeChased = chased.getSnapshot().fireflies[0];
    chased.addBat(beforeChased.x, beforeChased.y);
    chased.step(1);
    const afterChased = chased.getSnapshot().fireflies[0];
    expect(Math.hypot(afterChased.x - beforeChased.x, afterChased.y - beforeChased.y)).toBeGreaterThan(0);
  });

  it('separates overlapping bats with softmax strategy parameters', async () => {
    const params = {
      ...defaultParams,
      N: 1,
      batCount: 0,
      v_bat: 1,
      R_bat_perception: 10,
      batSoftmaxTemperature: 0.8,
      batTopK: 3,
      batDecisionMin: 0.01,
      batDecisionMax: 0.01,
      batSeparationRadius: 1,
      batSeparationStrength: 1.2
    };
    const adapter = new FallbackFireflyAdapter(params);
    await adapter.init(800, 600, 33, params);
    adapter.addFireflies(2, 5, 1, 0);
    adapter.addFireflies(8, 5, 1, 0);
    adapter.addBat(5, 5);
    adapter.addBat(5, 5);
    adapter.step(25);
    const bats = adapter.getSnapshot().bats;
    expect(Math.hypot(bats[0].x - bats[1].x, bats[0].y - bats[1].y)).toBeGreaterThan(0);
  });
});
