#include "../firefly.hpp"

#include <cmath>
#include <iostream>
#include <stdexcept>

using firefly::Firefly;
using firefly::Simulation;

namespace {

void require(bool condition, const char* message) {
  if (!condition) throw std::runtime_error(message);
}

void test_phase_wrap() {
  require(firefly::wrapPhase(-0.1f) >= 0.0f, "negative phase wraps into range");
  require(firefly::wrapPhase(100.0f) < firefly::kTwoPi, "large phase wraps below 2pi");
}

void test_neighbors_and_blocking() {
  Simulation sim;
  sim.setParam(1, 10);
  sim.setParam(3, 2.0);
  sim.addFireflies(1.0f, 1.0f, 1, 0.0f);
  sim.addFireflies(2.0f, 1.0f, 1, 0.0f);
  require(sim.canSee(sim.fireflies()[0], sim.fireflies()[1]), "near fireflies are neighbors");
  sim.addObstacle(1.5f, 1.0f, 0.2f);
  require(!sim.canSee(sim.fireflies()[0], sim.fireflies()[1]), "obstacle blocks visibility");
  sim.setParam(12, 0);
  require(sim.canSee(sim.fireflies()[0], sim.fireflies()[1]), "visibility toggle disables blocking");
}

void test_order_parameter() {
  Simulation sim;
  sim.setParam(0, 4);
  sim.setParam(6, 0);
  sim.reset(3);
  auto& mutableFireflies = const_cast<std::vector<Firefly>&>(sim.fireflies());
  for (auto& f : mutableFireflies) f.theta = 1.0f;
  sim.computeMetrics(0);
  require(sim.metrics().r > 0.99f, "identical phases give r near one");
  mutableFireflies[0].theta = 0.0f;
  mutableFireflies[1].theta = firefly::kPi * 0.5f;
  mutableFireflies[2].theta = firefly::kPi;
  mutableFireflies[3].theta = firefly::kPi * 1.5f;
  sim.computeMetrics(0);
  require(sim.metrics().r < 0.05f, "uniform phases give r near zero");
}

void test_coupling_trend() {
  Simulation strong;
  strong.setParam(0, 80);
  strong.setParam(2, 5.0);
  strong.setParam(3, 10.0);
  strong.setParam(4, 0.0);
  strong.reset(9);
  const float initial = strong.metrics().r;
  strong.step(500);
  require(strong.metrics().r > initial, "strong coupling increases order parameter");

  Simulation zero;
  zero.setParam(0, 80);
  zero.setParam(2, 0.0);
  zero.setParam(3, 10.0);
  zero.setParam(4, 0.0);
  zero.reset(9);
  zero.step(500);
  require(zero.metrics().r < 0.75f, "zero coupling does not force stable global synchrony");
}

void test_local_order_clusters() {
  Simulation sim;
  sim.setParam(3, 1.5);
  sim.addFireflies(1.0f, 1.0f, 2, 0.1f);
  sim.addFireflies(8.0f, 8.0f, 2, 0.1f);
  auto& fs = const_cast<std::vector<Firefly>&>(sim.fireflies());
  fs[0].theta = 0.0f;
  fs[1].theta = 0.0f;
  fs[2].theta = firefly::kPi;
  fs[3].theta = firefly::kPi;
  sim.computeMetrics(0);
  require(sim.metrics().r < 0.1f, "opposite clusters have low global order");
  require(sim.metrics().rLocalMean > 0.9f, "within-cluster local order stays high");
}

void test_scan() {
  Simulation sim;
  sim.setParam(0, 60);
  sim.setParam(3, 10.0);
  sim.setParam(4, 0.0);
  sim.reset(5);
  sim.runScan(0, 0.0f, 5.0f, 5, 200, 80, 0.35f);
  require(sim.scanResults().size() == 5, "scan emits requested samples");
  require(sim.scanResults().back().rBar >= sim.scanResults().front().rBar, "K scan has broadly increasing trend");
}

void test_mobility_bounds() {
  Simulation sim;
  sim.setParam(0, 24);
  sim.setParam(19, 1);
  sim.setParam(20, 1.2);
  sim.setParam(21, 1.0);
  sim.reset(12);
  sim.step(300);
  for (const auto& f : sim.fireflies()) {
    require(f.x >= 0.0f && f.x <= sim.params().L, "moving firefly x remains in bounds");
    require(f.y >= 0.0f && f.y <= sim.params().L, "moving firefly y remains in bounds");
  }
}

void test_bat_capture_and_panic() {
  Simulation sim;
  sim.setParam(0, 1);
  sim.setParam(19, 0);
  sim.setParam(23, 2.0);
  sim.setParam(24, 2.0);
  sim.setParam(29, 0.5);
  sim.reset(21);
  const auto first = sim.fireflies()[0];
  sim.addBat(first.x, first.y);
  sim.step(1);
  require(sim.metrics().capturedCount >= 1.0f, "bat capture marks firefly as captured");
  require(sim.metrics().aliveCount <= 0.0f, "captured firefly is removed from live metrics");
}

void test_bat_radius_suppresses_flash_and_phase() {
  Simulation sim;
  sim.setParam(0, 1);
  sim.setParam(19, 0);
  sim.setParam(25, 0);
  sim.setParam(27, 0);
  sim.setParam(28, 3.0);
  sim.reset(31);
  auto& mutableFireflies = const_cast<std::vector<Firefly>&>(sim.fireflies());
  mutableFireflies[0].theta = 1.2f;
  mutableFireflies[0].brightness = 1.0f;
  const auto first = mutableFireflies[0];
  sim.addBat(first.x, first.y);
  sim.step(1);
  require(std::abs(sim.fireflies()[0].theta - 1.2f) < 1e-5f, "bat perception freezes firefly phase");
  require(sim.fireflies()[0].brightness == 0.0f, "bat perception suppresses firefly brightness");
}

}  // namespace

int main() {
  try {
    test_phase_wrap();
    test_neighbors_and_blocking();
    test_order_parameter();
    test_coupling_trend();
    test_local_order_clusters();
    test_scan();
    test_mobility_bounds();
    test_bat_capture_and_panic();
    test_bat_radius_suppresses_flash_and_phase();
  } catch (const std::exception& err) {
    std::cerr << "C++ test failed: " << err.what() << "\n";
    return 1;
  }
  std::cout << "C++ firefly tests passed\n";
  return 0;
}
