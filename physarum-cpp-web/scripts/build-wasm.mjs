import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const outDir = resolve(root, "public/wasm");
mkdirSync(outDir, { recursive: true });

const emcc = spawnSync("emcc", ["--version"], { encoding: "utf8" });
if (emcc.error || emcc.status !== 0) {
  console.log("Emscripten emcc was not found. The app will use the TypeScript fallback simulator.");
  console.log("Install/activate Emscripten, then run npm run build:wasm again to produce public/wasm/physarum.js and physarum.wasm.");
  process.exit(0);
}

const sources = [
  resolve(root, "cpp/physarum.cpp"),
  resolve(root, "cpp/wasm_exports.cpp")
];

for (const source of sources) {
  if (!existsSync(source)) {
    console.error(`Missing source: ${source}`);
    process.exit(1);
  }
}

const args = [
  ...sources,
  "-std=c++20",
  "-O3",
  "-s", "MODULARIZE=1",
  "-s", "EXPORT_ES6=1",
  "-s", "ALLOW_MEMORY_GROWTH=1",
  "-s", "EXPORTED_RUNTIME_METHODS=['ccall','cwrap']",
  "-s", "EXPORTED_FUNCTIONS=['_malloc','_free','_sim_init','_sim_reset','_sim_step','_sim_set_param','_sim_add_agents','_sim_add_food','_sim_erase','_sim_get_agent_count','_sim_get_food_count','_sim_get_trail_ptr','_sim_get_food_field_ptr','_sim_get_agent_ptr','_sim_get_food_ptr','_sim_get_metrics_ptr','_sim_get_network_ptr','_sim_get_network_float_count','_sim_get_backend_code']",
  "-o", resolve(outDir, "physarum.js")
];

const result = spawnSync("emcc", args, { stdio: "inherit" });
process.exit(result.status ?? 1);
