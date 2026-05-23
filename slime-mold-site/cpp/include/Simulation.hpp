#pragma once

#include "Agent.hpp"
#include "FieldGrid.hpp"
#include "FoodSource.hpp"
#include "PhysarumSolver.hpp"
#include "RNG.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace physarum {

class Simulation {
public:
  Simulation(int width, int height, uint64_t seed);

  void step(double dt, int substeps);
  void reset(uint64_t seed);
  void setParamsJson(const char* json);
  void addAgents(double x, double y, int count, double radius);
  void addFood(double x, double y, double calories, double radius, double attractorStrength);
  void eraseAt(double x,
               double y,
               double radius,
               bool eraseSlime,
               bool eraseFood,
               bool eraseTrail,
               bool eraseWall);
  void addWall(double x, double y, double radius);
  void importStateJson(const char* json);

  const char* statsJson();
  const char* networkJson();
  const char* exportStateJson();

  uint8_t* renderBufferPtr();
  int renderBufferWidth() const { return fields_.width(); }
  int renderBufferHeight() const { return fields_.height(); }
  float* agentBufferPtr();
  int agentCount() const { return renderAgentCount_; }

private:
  double normalizeAngle(double a) const;
  double circularMix(double from, double to, double t) const;
  double sigmoid(double x) const;
  double agentSpeed(double energy) const;
  void stepAgent(Agent& agent, double dt, std::vector<Agent>& born);
  void applyBoundary(Vec2& oldPos, Vec2& newPos, double& angle);
  void updateRenderBuffers();
  void updateStatsCache();
  Vec2 colonyCenter() const;
  int liveAgentCount() const;
  double averageEnergy() const;
  double totalFoodRemaining() const;

  int width_ = 0;
  int height_ = 0;
  uint64_t seed_ = 1;
  int nextAgentId_ = 1;
  int nextFoodId_ = 1;
  double time_ = 0.0;
  double networkAccumulator_ = 0.0;
  double avgSearchProbability_ = 0.0;
  double searchRatio_ = 0.0;

  Params params_;
  RNG rng_;
  FieldGrid fields_;
  PhysarumSolver solver_;
  std::vector<Agent> agents_;
  std::vector<FoodSource> foods_;
  std::vector<uint8_t> renderBuffer_;
  std::vector<float> agentBuffer_;
  int renderAgentCount_ = 0;
  std::string statsCache_;
  std::string networkCache_;
  std::string stateCache_;
};

} // namespace physarum
