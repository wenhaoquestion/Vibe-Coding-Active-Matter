#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>

namespace physarum {

struct Vec2 {
  double x = 0.0;
  double y = 0.0;
};

inline double clamp01(double v) { return std::clamp(v, 0.0, 1.0); }
inline double safeLength(Vec2 v) { return std::sqrt(v.x * v.x + v.y * v.y); }
inline double safeAtan2(Vec2 v) { return std::atan2(v.y, v.x); }

struct Params {
  int targetAgentCount = 2500;
  int maxAgents = 20000;
  int randomSeed = 1337;
  int boundaryMode = 1; // 0 = wrap, 1 = reflect
  int solverEnabled = 1;
  int showTrail = 1;
  int showAgents = 1;
  int showFoodField = 0;
  int showNetwork = 1;
  int showShortestPath = 1;

  double energyMax = 100.0;
  double initialEnergy = 62.0;
  double sensorAngle = 0.62;
  double sensorDistance = 9.0;
  double rotationAngle = 0.45;
  double speedMin = 8.0;
  double speedMax = 45.0;
  double trailDeposit = 7.5;
  double trailDiffusion = 0.12;
  double trailDecay = 0.022;
  double trailMax = 24.0;
  double trailWeight = 1.0;
  double foodWeight = 2.0;
  double repellentWeight = 3.0;
  double randomSensorNoise = 0.03;
  double searchRandomness = 0.38;

  double baseEnergyCost = 0.52;
  double moveEnergyCost = 0.025;
  double sensorEnergyCost = 0.035;
  double trailEnergyCost = 0.012;
  double eatRate = 24.0;
  double foodEnergyEfficiency = 1.75;
  double foodAttractionGamma = 1.8;
  double depletedFoodSignal = 0.0;

  double splitEnergyThreshold = 84.0;
  double splitProbability = 0.06;
  double splitRatio = 0.48;
  double splitAngle = 0.85;
  double deathEnergyThreshold = 1.0;
  double deathTime = 8.0;
  double lowEnergyThreshold = 25.0;

  double searchA0 = -0.25;
  double searchAE = 1.15;
  double searchAF = 1.8;
  double searchAT = 1.2;
  double searchAN = 1.25;
  double searchAC = 0.45;

  double foodCalories = 700.0;
  double foodRadius = 14.0;
  double attractorStrength = 18.0;
  double brushRadius = 18.0;
  int brushAgents = 150;
  int substeps = 2;

  int graphStride = 8;
  double trailThreshold = 0.85;
  int pressureIterations = 80;
  double pressureTolerance = 1e-5;
  double conductivityAlpha = 1.15;
  double conductivityMu = 1.0;
  double conductivityDecay = 0.25;
  double conductivityMin = 0.035;
  double conductivityMax = 8.0;
  double lambdaEnergy = 0.08;
};

} // namespace physarum
