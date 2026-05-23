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
});
