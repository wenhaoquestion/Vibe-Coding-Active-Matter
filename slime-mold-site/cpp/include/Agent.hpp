#pragma once

#include "Params.hpp"

namespace physarum {

struct Agent {
  int id = 0;
  Vec2 position;
  double angle = 0.0;
  int speciesId = 0;
  double energy = 0.0;
  double age = 0.0;
  bool alive = true;
  bool searchMode = true;
  double carriedNutrient = 0.0;
  double recentFoodSignal = 0.0;
  double lastFoodDistance = 1e9;
  double novelty = 1.0;
  double starvationTimer = 0.0;
  double bestDirection = 0.0;
};

} // namespace physarum
