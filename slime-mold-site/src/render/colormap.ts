export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function mixColor(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(lerp(a.r, b.r, t)),
    g: Math.round(lerp(a.g, b.g, t)),
    b: Math.round(lerp(a.b, b.b, t)),
  };
}

export function energyColor(energy01: number, searchMode: boolean): string {
  const low = { r: 218, g: 86, b: 80 };
  const high = searchMode ? { r: 110, g: 229, b: 190 } : { r: 252, g: 211, b: 112 };
  const c = mixColor(low, high, Math.sqrt(clamp01(energy01)));
  return `rgb(${c.r} ${c.g} ${c.b})`;
}
