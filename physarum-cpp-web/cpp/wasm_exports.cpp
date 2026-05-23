#include "physarum.hpp"

#include <memory>

namespace {
std::unique_ptr<physarum::Simulation> sim;

physarum::Simulation& require_sim() {
  if (!sim) {
    sim = std::make_unique<physarum::Simulation>(192, 128, 1);
  }
  return *sim;
}
} // namespace

extern "C" {

void sim_init(int width, int height, int seed) {
  sim = std::make_unique<physarum::Simulation>(width, height, static_cast<std::uint32_t>(seed));
}

void sim_reset(int seed) {
  require_sim().reset(static_cast<std::uint32_t>(seed));
}

void sim_step(int steps) {
  require_sim().step(steps);
}

void sim_set_param(int param_id, double value) {
  require_sim().setParam(param_id, value);
}

void sim_add_agents(float x, float y, int count, float radius, float energy) {
  require_sim().addAgents(x, y, count, radius, energy);
}

void sim_add_food(float x, float y, float calories, float radius, float quality) {
  require_sim().addFood(x, y, calories, radius, quality);
}

void sim_erase(float x, float y, float radius) {
  require_sim().erase(x, y, radius);
}

int sim_get_agent_count() {
  return require_sim().agentCount();
}

int sim_get_food_count() {
  return require_sim().foodCount();
}

float* sim_get_trail_ptr() {
  return require_sim().trailPtr();
}

float* sim_get_food_field_ptr() {
  return require_sim().foodFieldPtr();
}

float* sim_get_agent_ptr() {
  return require_sim().agentPtr();
}

float* sim_get_food_ptr() {
  return require_sim().foodPtr();
}

float* sim_get_metrics_ptr() {
  return require_sim().metricsPtr();
}

float* sim_get_network_ptr() {
  return require_sim().networkPtr();
}

int sim_get_network_float_count() {
  return require_sim().networkFloatCount();
}

int sim_get_backend_code() {
  return 1;
}

}
