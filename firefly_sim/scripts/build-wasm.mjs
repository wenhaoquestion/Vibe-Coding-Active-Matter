import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'public/wasm/firefly.js');
mkdirSync(dirname(output), { recursive: true });

const probe = process.platform === 'win32'
  ? spawnSync('where', ['emcc'], { stdio: 'ignore', shell: true })
  : spawnSync('command -v emcc', { stdio: 'ignore', shell: true });
if (probe.status !== 0) {
  console.error('Emscripten emcc was not found. Install/activate Emscripten, then rerun npm run build:wasm.');
  process.exit(1);
}

const args = [
  'cpp/firefly.cpp',
  'cpp/wasm_exports.cpp',
  '-std=c++17',
  '-O3',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sENVIRONMENT=web',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sEXPORTED_RUNTIME_METHODS=["HEAPF32"]',
  '-sEXPORTED_FUNCTIONS=["_sim_init","_sim_reset","_sim_step","_sim_set_param","_sim_add_fireflies","_sim_erase_fireflies","_sim_add_obstacle","_sim_erase_obstacles","_sim_clear_obstacles","_sim_add_city_light","_sim_erase_city_lights","_sim_clear_city_lights","_sim_add_bat","_sim_erase_bats","_sim_clear_bats","_sim_run_scan","_sim_get_firefly_count","_sim_get_obstacle_count","_sim_get_city_light_count","_sim_get_bat_count","_sim_get_time_series_count","_sim_get_scan_count","_sim_get_estimated_kc","_sim_get_time","_sim_get_firefly_ptr","_sim_get_obstacle_ptr","_sim_get_city_light_ptr","_sim_get_bat_ptr","_sim_get_metrics_ptr","_sim_get_time_series_ptr","_sim_get_scan_results_ptr"]',
  '-o',
  output
];

const result = spawnSync('emcc', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error?.code === 'ENOENT' || result.status === 9009) {
  console.error('Emscripten emcc was not found. Install/activate Emscripten, then rerun npm run build:wasm.');
  process.exit(1);
}
process.exit(result.status ?? 0);
