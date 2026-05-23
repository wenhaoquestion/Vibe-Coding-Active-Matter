#pragma once

#include <cstdint>
#include <random>
#include <vector>

namespace firefly {

constexpr float kPi = 3.14159265358979323846f;
constexpr float kTwoPi = 2.0f * kPi;

struct Firefly {
  float x = 0.0f;
  float y = 0.0f;
  float vx = 0.0f;
  float vy = 0.0f;
  float heading = 0.0f;
  float speed = 0.0f;
  float theta = 0.0f;
  float omega = 1.0f;
  float brightness = 0.0f;
  float localOrder = 0.0f;
  float panic = 0.0f;
  int neighborCount = 0;
  std::uint8_t species = 0;
  std::uint8_t alive = 1;
};

struct Obstacle {
  float x = 0.0f;
  float y = 0.0f;
  float radius = 1.0f;
  std::uint8_t active = 1;
};

struct CityLight {
  float x = 0.0f;
  float y = 0.0f;
  float radius = 1.0f;
  float epsilon = 0.0f;
  float omega = 1.0f;
  float phase = 0.0f;
  std::uint8_t active = 1;
};

struct Bat {
  float x = 0.0f;
  float y = 0.0f;
  float vx = 0.0f;
  float vy = 0.0f;
  float heading = 0.0f;
  float speed = 1.0f;
  float perceptionRadius = 2.0f;
  float captureRadius = 0.15f;
  int targetIndex = -1;
  float hunger = 0.0f;
  std::uint8_t active = 1;
};

struct Params {
  int N = 500;
  float L = 10.0f;
  float K = 2.0f;
  float R_visual = 2.0f;
  float D = 0.02f;
  float omega0 = 1.0f;
  float sigma_omega = 0.5f;
  float dt = 0.01f;
  float sigma_flash = 0.25f;
  float epsilon_city = 0.0f;
  float Omega_city = 1.0f;
  float phi_city = 0.0f;
  bool blockVisibility = true;
  int speciesMode = 1;
  float omega_A = 0.85f;
  float omega_B = 1.25f;
  float K_in = 2.4f;
  float K_out = 0.8f;
  int flashMode = 2;
  bool mobilityEnabled = false;
  float v_firefly = 0.25f;
  float D_turn = 0.35f;
  float D_move = 0.02f;
  float R_avoid = 1.2f;
  float chi_bat = 1.1f;
  bool predationEnabled = true;
  int batCount = 0;
  float v_bat = 0.8f;
  float R_bat_perception = 2.8f;
  float R_capture = 0.16f;
  float batTurnNoise = 0.25f;
};

struct Metrics {
  float r = 0.0f;
  float psi = 0.0f;
  float rLocalMean = 0.0f;
  float avgNeighbors = 0.0f;
  float isolatedCount = 0.0f;
  float flashCount = 0.0f;
  float cityLockDelta = 0.0f;
  float rA = 0.0f;
  float rB = 0.0f;
  float aliveCount = 0.0f;
  float capturedCount = 0.0f;
  float meanPanic = 0.0f;
  float meanNearestBatDistance = 0.0f;
  float batTargetCount = 0.0f;
};

struct ScanPoint {
  float value = 0.0f;
  float rBar = 0.0f;
};

float wrapPhase(float theta);
float signedWrap(float theta);

class Simulation {
 public:
  void init(int width, int height, int seed);
  void reset(int seed);
  void step(int steps);
  void setParam(int paramId, double value);
  void addFireflies(float x, float y, int count, float radius);
  void eraseFireflies(float x, float y, float radius);
  void addObstacle(float x, float y, float radius);
  void clearObstacles();
  void addCityLight(float x, float y, float radius, float epsilon, float omega);
  void clearCityLights();
  void addBat(float x, float y);
  void clearBats();
  void runScan(int kind, float minValue, float maxValue, int samples, int steps, int burnIn, float threshold);

  bool canSee(const Firefly& a, const Firefly& b) const;
  void computeMetrics(float flashCount);

  const Params& params() const { return params_; }
  const std::vector<Firefly>& fireflies() const { return fireflies_; }
  const std::vector<Obstacle>& obstacles() const { return obstacles_; }
  const std::vector<CityLight>& cityLights() const { return cityLights_; }
  const std::vector<Bat>& bats() const { return bats_; }
  const Metrics& metrics() const { return metrics_; }
  const std::vector<Metrics>& history() const { return history_; }
  const std::vector<ScanPoint>& scanResults() const { return scanResults_; }
  float estimatedKc() const { return estimatedKc_; }
  float time() const { return time_; }

 private:
  Firefly makeFirefly(float x, float y, int index);
  void stepOnce(bool record);
  void updateBats();
  void updateFireflyMotion();
  void reflectInBounds(float& x, float& y, float& vx, float& vy, float& heading) const;
  float brightness(float theta) const;
  float couplingFor(const Firefly& a, const Firefly& b) const;
  void pushHistory();

  Params params_;
  std::vector<Firefly> fireflies_;
  std::vector<Obstacle> obstacles_;
  std::vector<CityLight> cityLights_;
  std::vector<Bat> bats_;
  Metrics metrics_;
  std::vector<Metrics> history_;
  std::vector<ScanPoint> scanResults_;
  std::mt19937 rng_{1};
  std::normal_distribution<float> normal_{0.0f, 1.0f};
  std::uniform_real_distribution<float> uniform_{0.0f, 1.0f};
  float time_ = 0.0f;
  float lastPsi_ = 0.0f;
  float estimatedKc_ = -1.0f;
};

}  // namespace firefly
