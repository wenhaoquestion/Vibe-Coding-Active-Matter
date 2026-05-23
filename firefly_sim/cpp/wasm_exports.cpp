#include "firefly.hpp"

#include <vector>

namespace {

firefly::Simulation g_sim;
std::vector<float> g_fireflyBuffer;
std::vector<float> g_obstacleBuffer;
std::vector<float> g_cityLightBuffer;
std::vector<float> g_batBuffer;
std::vector<float> g_metricsBuffer(14, 0.0f);
std::vector<float> g_historyBuffer;
std::vector<float> g_scanBuffer;

void syncFireflies() {
  const auto& fireflies = g_sim.fireflies();
  g_fireflyBuffer.resize(fireflies.size() * 14);
  for (std::size_t i = 0; i < fireflies.size(); ++i) {
    const auto& f = fireflies[i];
    const std::size_t off = i * 14;
    g_fireflyBuffer[off] = f.x;
    g_fireflyBuffer[off + 1] = f.y;
    g_fireflyBuffer[off + 2] = f.vx;
    g_fireflyBuffer[off + 3] = f.vy;
    g_fireflyBuffer[off + 4] = f.heading;
    g_fireflyBuffer[off + 5] = f.speed;
    g_fireflyBuffer[off + 6] = f.theta;
    g_fireflyBuffer[off + 7] = f.omega;
    g_fireflyBuffer[off + 8] = f.brightness;
    g_fireflyBuffer[off + 9] = f.localOrder;
    g_fireflyBuffer[off + 10] = f.panic;
    g_fireflyBuffer[off + 11] = static_cast<float>(f.neighborCount);
    g_fireflyBuffer[off + 12] = static_cast<float>(f.species);
    g_fireflyBuffer[off + 13] = static_cast<float>(f.alive);
  }
}

void syncObstacles() {
  const auto& obstacles = g_sim.obstacles();
  g_obstacleBuffer.resize(obstacles.size() * 3);
  for (std::size_t i = 0; i < obstacles.size(); ++i) {
    g_obstacleBuffer[i * 3] = obstacles[i].x;
    g_obstacleBuffer[i * 3 + 1] = obstacles[i].y;
    g_obstacleBuffer[i * 3 + 2] = obstacles[i].radius;
  }
}

void syncCityLights() {
  const auto& lights = g_sim.cityLights();
  g_cityLightBuffer.resize(lights.size() * 6);
  for (std::size_t i = 0; i < lights.size(); ++i) {
    g_cityLightBuffer[i * 6] = lights[i].x;
    g_cityLightBuffer[i * 6 + 1] = lights[i].y;
    g_cityLightBuffer[i * 6 + 2] = lights[i].radius;
    g_cityLightBuffer[i * 6 + 3] = lights[i].epsilon;
    g_cityLightBuffer[i * 6 + 4] = lights[i].omega;
    g_cityLightBuffer[i * 6 + 5] = lights[i].phase;
  }
}

void syncBats() {
  const auto& bats = g_sim.bats();
  g_batBuffer.resize(bats.size() * 10);
  for (std::size_t i = 0; i < bats.size(); ++i) {
    const auto& b = bats[i];
    const std::size_t off = i * 10;
    g_batBuffer[off] = b.x;
    g_batBuffer[off + 1] = b.y;
    g_batBuffer[off + 2] = b.vx;
    g_batBuffer[off + 3] = b.vy;
    g_batBuffer[off + 4] = b.heading;
    g_batBuffer[off + 5] = b.speed;
    g_batBuffer[off + 6] = b.perceptionRadius;
    g_batBuffer[off + 7] = b.captureRadius;
    g_batBuffer[off + 8] = static_cast<float>(b.targetIndex);
    g_batBuffer[off + 9] = b.hunger;
  }
}

void syncMetrics() {
  const auto& m = g_sim.metrics();
  g_metricsBuffer = {m.r, m.psi, m.rLocalMean, m.avgNeighbors, m.isolatedCount, m.flashCount, m.cityLockDelta, m.rA, m.rB, m.aliveCount, m.capturedCount, m.meanPanic, m.meanNearestBatDistance, m.batTargetCount};
}

void syncHistory() {
  const auto& history = g_sim.history();
  g_historyBuffer.resize(history.size() * 14);
  for (std::size_t i = 0; i < history.size(); ++i) {
    const auto& m = history[i];
    const std::size_t off = i * 14;
    g_historyBuffer[off] = m.r;
    g_historyBuffer[off + 1] = m.psi;
    g_historyBuffer[off + 2] = m.rLocalMean;
    g_historyBuffer[off + 3] = m.avgNeighbors;
    g_historyBuffer[off + 4] = m.isolatedCount;
    g_historyBuffer[off + 5] = m.flashCount;
    g_historyBuffer[off + 6] = m.cityLockDelta;
    g_historyBuffer[off + 7] = m.rA;
    g_historyBuffer[off + 8] = m.rB;
    g_historyBuffer[off + 9] = m.aliveCount;
    g_historyBuffer[off + 10] = m.capturedCount;
    g_historyBuffer[off + 11] = m.meanPanic;
    g_historyBuffer[off + 12] = m.meanNearestBatDistance;
    g_historyBuffer[off + 13] = m.batTargetCount;
  }
}

void syncScan() {
  const auto& scan = g_sim.scanResults();
  g_scanBuffer.resize(scan.size() * 2);
  for (std::size_t i = 0; i < scan.size(); ++i) {
    g_scanBuffer[i * 2] = scan[i].value;
    g_scanBuffer[i * 2 + 1] = scan[i].rBar;
  }
}

void syncAll() {
  syncFireflies();
  syncObstacles();
  syncCityLights();
  syncBats();
  syncMetrics();
  syncHistory();
  syncScan();
}

}  // namespace

extern "C" {

void sim_init(int width, int height, int seed) {
  g_sim.init(width, height, seed);
  syncAll();
}

void sim_reset(int seed) {
  g_sim.reset(seed);
  syncAll();
}

void sim_step(int steps) {
  g_sim.step(steps);
  syncAll();
}

void sim_set_param(int param_id, double value) {
  g_sim.setParam(param_id, value);
  syncAll();
}

void sim_add_fireflies(float x, float y, int count, float radius) {
  g_sim.addFireflies(x, y, count, radius);
  syncAll();
}

void sim_erase_fireflies(float x, float y, float radius) {
  g_sim.eraseFireflies(x, y, radius);
  syncAll();
}

void sim_add_obstacle(float x, float y, float radius) {
  g_sim.addObstacle(x, y, radius);
  syncAll();
}

void sim_clear_obstacles() {
  g_sim.clearObstacles();
  syncAll();
}

void sim_add_city_light(float x, float y, float radius, float epsilon, float omega) {
  g_sim.addCityLight(x, y, radius, epsilon, omega);
  syncAll();
}

void sim_clear_city_lights() {
  g_sim.clearCityLights();
  syncAll();
}

void sim_add_bat(float x, float y) {
  g_sim.addBat(x, y);
  syncAll();
}

void sim_clear_bats() {
  g_sim.clearBats();
  syncAll();
}

void sim_run_scan(int kind, float min_value, float max_value, int samples, int steps, int burn_in, float threshold) {
  g_sim.runScan(kind, min_value, max_value, samples, steps, burn_in, threshold);
  syncAll();
}

int sim_get_firefly_count() { return static_cast<int>(g_sim.fireflies().size()); }
int sim_get_obstacle_count() { return static_cast<int>(g_sim.obstacles().size()); }
int sim_get_city_light_count() { return static_cast<int>(g_sim.cityLights().size()); }
int sim_get_bat_count() { return static_cast<int>(g_sim.bats().size()); }
int sim_get_time_series_count() { return static_cast<int>(g_sim.history().size()); }
int sim_get_scan_count() { return static_cast<int>(g_sim.scanResults().size()); }
float sim_get_estimated_kc() { return g_sim.estimatedKc(); }
float sim_get_time() { return g_sim.time(); }
float* sim_get_firefly_ptr() { return g_fireflyBuffer.data(); }
float* sim_get_obstacle_ptr() { return g_obstacleBuffer.data(); }
float* sim_get_city_light_ptr() { return g_cityLightBuffer.data(); }
float* sim_get_bat_ptr() { return g_batBuffer.data(); }
float* sim_get_metrics_ptr() { return g_metricsBuffer.data(); }
float* sim_get_time_series_ptr() { return g_historyBuffer.data(); }
float* sim_get_scan_results_ptr() { return g_scanBuffer.data(); }

}
