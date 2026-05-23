#pragma once

#include <cstdint>
#include <vector>

namespace physarum {

enum Mode : std::uint8_t {
  Search = 0,
  Exploit = 1,
  Dormant = 2
};

enum ParamId : int {
  ParamSpeed = 0,
  ParamSensorDistance,
  ParamSensorAngle,
  ParamTurnAngle,
  ParamTrailDeposit,
  ParamTrailDecay,
  ParamTrailDiffuse,
  ParamFoodCalories,
  ParamFoodRadius,
  ParamFoodQuality,
  ParamMaxEnergy,
  ParamBaseMetabolism,
  ParamMoveCost,
  ParamSearchCost,
  ParamEatRate,
  ParamEatEfficiency,
  ParamGrowthThreshold,
  ParamGrowthRate,
  ParamGrowthCost,
  ParamSplitMass,
  ParamSplitEnergy,
  ParamStarvationSteps,
  ParamNetworkInterval,
  ParamBrushRadius
};

struct Agent {
  float x = 0.0f;
  float y = 0.0f;
  float theta = 0.0f;
  float energy = 1.0f;
  float mass = 1.0f;
  int starvation = 0;
  Mode mode = Search;
  bool alive = true;
};

struct Food {
  float x = 0.0f;
  float y = 0.0f;
  float calories = 1.0f;
  float quality = 1.0f;
  float sigma = 18.0f;
  float radius = 10.0f;
};

struct Params {
  float speed = 1.35f;
  float sensorDistance = 9.0f;
  float sensorAngle = 0.62f;
  float turnAngle = 0.32f;
  float trailDeposit = 0.34f;
  float trailDecay = 0.042f;
  float trailDiffuse = 0.24f;
  float defaultFoodCalories = 520.0f;
  float defaultFoodRadius = 13.0f;
  float defaultFoodQuality = 1.0f;
  float maxEnergy = 100.0f;
  float baseMetabolism = 0.018f;
  float moveCost = 0.009f;
  float searchCost = 0.018f;
  float eatRate = 0.38f;
  float eatEfficiency = 2.5f;
  float growthThreshold = 0.72f;
  float growthRate = 0.016f;
  float growthCost = 16.0f;
  float splitMass = 2.2f;
  float splitEnergy = 78.0f;
  float starvationSteps = 420.0f;
  float networkInterval = 18.0f;
  float brushRadius = 18.0f;
};

struct Metrics {
  float alive = 0.0f;
  float agents = 0.0f;
  float foods = 0.0f;
  float totalBiomass = 0.0f;
  float avgEnergy = 0.0f;
  float foodRemaining = 0.0f;
  float searchCount = 0.0f;
  float exploitCount = 0.0f;
  float dormantCount = 0.0f;
  float pathLength = 0.0f;
  float transportCost = 0.0f;
  float dissipation = 0.0f;
  float backendCode = 1.0f;
};

class Simulation {
public:
  Simulation(int width, int height, std::uint32_t seed);

  void reset(std::uint32_t seed);
  void step(int steps = 1);
  void setParam(int id, double value);
  void addAgents(float x, float y, int count, float radius, float energy);
  void addFood(float x, float y, float calories, float radius, float quality);
  void erase(float x, float y, float radius);

  int width() const { return width_; }
  int height() const { return height_; }
  int agentCount() const { return static_cast<int>(agents_.size()); }
  int foodCount() const { return static_cast<int>(foods_.size()); }
  int networkFloatCount() const { return static_cast<int>(networkFloats_.size()); }

  const std::vector<Agent>& agents() const { return agents_; }
  const std::vector<Food>& foods() const { return foods_; }
  const Metrics& metrics() const { return metrics_; }
  const Params& params() const { return params_; }

  float* trailPtr() { return trail_.data(); }
  float* foodFieldPtr() { return foodField_.data(); }
  float* agentPtr();
  float* foodPtr();
  float* metricsPtr();
  float* networkPtr();

  float searchProbability(float energy, float signal) const;
  void updateNetwork();

private:
  struct Node {
    float x = 0.0f;
    float y = 0.0f;
    int kind = 0;
  };

  struct Edge {
    int a = 0;
    int b = 0;
    float length = 0.0f;
    float conductance = 0.15f;
    float flow = 0.0f;
    bool path = false;
  };

  int width_;
  int height_;
  int stepIndex_ = 0;
  std::uint32_t rng_;
  Params params_;
  Metrics metrics_;
  std::vector<Agent> agents_;
  std::vector<Food> foods_;
  std::vector<float> trail_;
  std::vector<float> trailScratch_;
  std::vector<float> foodField_;
  std::vector<float> agentFloats_;
  std::vector<float> foodFloats_;
  std::vector<float> metricFloats_;
  std::vector<float> networkFloats_;
  std::vector<Node> nodes_;
  std::vector<Edge> edges_;

  float rand01();
  float randSigned();
  int index(int x, int y) const;
  void seedDefaultWorld();
  void updateFoodField();
  void diffuseTrail();
  void updateAgents();
  void updateMetrics();
  void depositTrail(const Agent& agent);
  float sampleField(float x, float y) const;
  float combinedSignal(float x, float y) const;
  void clampOrBounce(Agent& agent);
  void rebuildAgentFloats();
  void rebuildFoodFloats();
  void rebuildMetricFloats();
};

float sigmoid(float value);
float wrapAngle(float value);
float angleDelta(float from, float to);

} // namespace physarum
