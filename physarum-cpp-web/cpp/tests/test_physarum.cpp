#include "physarum.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace {
void expect(bool condition, const char* message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void test_energy_and_eating() {
  physarum::Simulation sim(96, 72, 12);
  sim.reset(12);
  sim.erase(48, 36, 200);
  sim.addFood(48, 36, 80, 10, 1);
  sim.addAgents(48, 36, 1, 0, 20);
  const float beforeFood = sim.foods().front().calories;
  sim.step(5);
  const auto& agent = sim.agents().front();
  expect(agent.energy > 20.0f, "agent should gain energy from food");
  expect(sim.foods().empty() || sim.foods().front().calories < beforeFood, "food calories should decrease");
}

void test_growth() {
  physarum::Simulation sim(96, 72, 4);
  sim.erase(48, 36, 200);
  sim.setParam(physarum::ParamGrowthRate, 0.2);
  sim.addAgents(40, 40, 1, 0, 98);
  const float mass = sim.agents().front().mass;
  sim.step(2);
  expect(sim.agents().front().mass > mass, "high energy agent should grow");
}

void test_search_probability() {
  physarum::Simulation sim(64, 64, 5);
  const float lowSignal = sim.searchProbability(80, 0.02f);
  const float highSignal = sim.searchProbability(80, 3.0f);
  const float starved = sim.searchProbability(2, 0.02f);
  expect(lowSignal >= 0.0f && lowSignal <= 1.0f, "search probability should be clamped");
  expect(lowSignal > highSignal, "weak signal should increase search probability");
  expect(lowSignal > starved, "starved agent should be less likely to continue exploring");
}

void test_network() {
  physarum::Simulation sim(120, 80, 7);
  sim.erase(60, 40, 200);
  sim.addFood(18, 20, 400, 10, 1);
  sim.addFood(100, 60, 400, 10, 1);
  sim.addAgents(50, 40, 80, 8, 80);
  sim.step(40);
  sim.updateNetwork();
  expect(sim.networkFloatCount() >= 7, "network should contain edge data");
  expect(sim.metrics().pathLength > 0.0f, "network should find a nutrient path");
}
} // namespace

int main() {
  try {
    test_energy_and_eating();
    test_growth();
    test_search_probability();
    test_network();
  } catch (const std::exception& error) {
    std::cerr << "C++ test failed: " << error.what() << "\n";
    return 1;
  }
  std::cout << "C++ physarum tests passed\n";
  return 0;
}
