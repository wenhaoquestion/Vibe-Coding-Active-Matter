import { clamp01, energyColor, mixColor } from "./colormap";

describe("colormap utilities", () => {
  it("clamps scalar values", () => {
    expect(clamp01(-4)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(4)).toBe(1);
  });

  it("mixes colors deterministically", () => {
    expect(mixColor({ r: 0, g: 0, b: 0 }, { r: 10, g: 20, b: 30 }, 0.5)).toEqual({
      r: 5,
      g: 10,
      b: 15,
    });
  });

  it("returns CSS rgb for agent energy", () => {
    expect(energyColor(0.5, true)).toMatch(/^rgb\(/);
  });
});
