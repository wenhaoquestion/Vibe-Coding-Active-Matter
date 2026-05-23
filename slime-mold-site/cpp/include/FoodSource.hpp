#pragma once

#include "Params.hpp"

namespace physarum {

struct FoodSource {
  int id = 0;
  Vec2 position;
  double radius = 12.0;
  double calories = 0.0;
  double maxCalories = 0.0;
  double attractorStrength = 1.0;
  bool enabled = true;
};

} // namespace physarum
