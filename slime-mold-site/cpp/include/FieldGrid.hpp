#pragma once

#include "FoodSource.hpp"
#include "Params.hpp"

#include <cstdint>
#include <vector>

namespace physarum {

class FieldGrid {
public:
  FieldGrid() = default;
  FieldGrid(int w, int h) { resize(w, h); }

  void resize(int w, int h);
  void clear();

  int width() const { return width_; }
  int height() const { return height_; }
  int index(int x, int y) const { return y * width_ + x; }
  bool inBounds(int x, int y) const { return x >= 0 && y >= 0 && x < width_ && y < height_; }

  float sampleTrail(double x, double y) const { return sampleBilinear(trail_, x, y); }
  float sampleFood(double x, double y) const { return sampleBilinear(food_, x, y); }
  float sampleRepellent(double x, double y) const { return sampleBilinear(repellent_, x, y); }
  float trailAtCell(int x, int y) const { return inBounds(x, y) ? trail_[index(x, y)] : 0.0f; }
  float wallAtCell(int x, int y) const { return inBounds(x, y) ? repellent_[index(x, y)] : 0.0f; }

  void addTrail(Vec2 p, double amount, double maxValue);
  void addWall(Vec2 p, double radius);
  void eraseCircle(Vec2 p, double radius, bool eraseTrail, bool eraseWall);
  void markVisited(Vec2 p);
  double coverage() const;
  double totalTrail() const;

  void rebuildFoodField(const std::vector<FoodSource>& foods, const Params& params);
  void diffuseAndDecay(double dt, const Params& params);
  void writeRenderBuffer(std::vector<uint8_t>& rgba, const Params& params) const;

  const std::vector<float>& trail() const { return trail_; }
  const std::vector<float>& food() const { return food_; }
  const std::vector<float>& repellent() const { return repellent_; }

private:
  float sampleBilinear(const std::vector<float>& data, double x, double y) const;

  int width_ = 0;
  int height_ = 0;
  std::vector<float> trail_;
  std::vector<float> food_;
  std::vector<float> repellent_;
  std::vector<uint8_t> visited_;
  int visitedCount_ = 0;
};

} // namespace physarum
