import { FallbackPhysarumEngine } from "./fallbackEngine";
import type { SimulatorBackend } from "../state/types";

export async function createPhysarumEngine(width = 240, height = 160, seed = 19): Promise<SimulatorBackend> {
  try {
    const response = await fetch("/wasm/physarum.js", { method: "HEAD" });
    if (!response.ok) {
      return new FallbackPhysarumEngine(width, height, seed);
    }
    // The API wrapper is intentionally conservative until an Emscripten build
    // exists in public/wasm. The fallback keeps the app fully usable locally.
    return new FallbackPhysarumEngine(width, height, seed);
  } catch {
    return new FallbackPhysarumEngine(width, height, seed);
  }
}
