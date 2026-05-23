#include "FieldGrid.hpp"

#include <algorithm>
#include <cmath>

namespace physarum {

void FieldGrid::resize(int w, int h) {
  width_ = std::max(1, w);
  height_ = std::max(1, h);
  const std::size_t n = static_cast<std::size_t>(width_) * static_cast<std::size_t>(height_);
  trail_.assign(n, 0.0f);
  food_.assign(n, 0.0f);
  repellent_.assign(n, 0.0f);
  visited_.assign(n, 0);
  visitedCount_ = 0;
}

void FieldGrid::clear() {
  std::fill(trail_.begin(), trail_.end(), 0.0f);
  std::fill(food_.begin(), food_.end(), 0.0f);
  std::fill(repellent_.begin(), repellent_.end(), 0.0f);
  std::fill(visited_.begin(), visited_.end(), 0);
  visitedCount_ = 0;
}

float FieldGrid::sampleBilinear(const std::vector<float>& data, double x, double y) const {
  if (data.empty()) {
    return 0.0f;
  }
  x = std::clamp(x, 0.0, static_cast<double>(width_ - 1));
  y = std::clamp(y, 0.0, static_cast<double>(height_ - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(x0 + 1, width_ - 1);
  const int y1 = std::min(y0 + 1, height_ - 1);
  const double tx = x - x0;
  const double ty = y - y0;
  const double v00 = data[index(x0, y0)];
  const double v10 = data[index(x1, y0)];
  const double v01 = data[index(x0, y1)];
  const double v11 = data[index(x1, y1)];
  return static_cast<float>((1.0 - tx) * (1.0 - ty) * v00 + tx * (1.0 - ty) * v10 +
                            (1.0 - tx) * ty * v01 + tx * ty * v11);
}

void FieldGrid::addTrail(Vec2 p, double amount, double maxValue) {
  const int x = static_cast<int>(std::round(p.x));
  const int y = static_cast<int>(std::round(p.y));
  if (!inBounds(x, y) || repellent_[index(x, y)] > 0.25f) {
    return;
  }
  const int idx = index(x, y);
  trail_[idx] = static_cast<float>(std::clamp(static_cast<double>(trail_[idx]) + amount, 0.0, maxValue));
}

void FieldGrid::addWall(Vec2 p, double radius) {
  const int minX = std::max(0, static_cast<int>(std::floor(p.x - radius)));
  const int maxX = std::min(width_ - 1, static_cast<int>(std::ceil(p.x + radius)));
  const int minY = std::max(0, static_cast<int>(std::floor(p.y - radius)));
  const int maxY = std::min(height_ - 1, static_cast<int>(std::ceil(p.y + radius)));
  const double r2 = radius * radius;
  for (int y = minY; y <= maxY; ++y) {
    for (int x = minX; x <= maxX; ++x) {
      const double dx = x - p.x;
      const double dy = y - p.y;
      if (dx * dx + dy * dy <= r2) {
        const int idx = index(x, y);
        repellent_[idx] = 1.0f;
        trail_[idx] = 0.0f;
        food_[idx] = 0.0f;
      }
    }
  }
}

void FieldGrid::eraseCircle(Vec2 p, double radius, bool eraseTrail, bool eraseWall) {
  const int minX = std::max(0, static_cast<int>(std::floor(p.x - radius)));
  const int maxX = std::min(width_ - 1, static_cast<int>(std::ceil(p.x + radius)));
  const int minY = std::max(0, static_cast<int>(std::floor(p.y - radius)));
  const int maxY = std::min(height_ - 1, static_cast<int>(std::ceil(p.y + radius)));
  const double r2 = radius * radius;
  for (int y = minY; y <= maxY; ++y) {
    for (int x = minX; x <= maxX; ++x) {
      const double dx = x - p.x;
      const double dy = y - p.y;
      if (dx * dx + dy * dy <= r2) {
        const int idx = index(x, y);
        if (eraseTrail) {
          trail_[idx] = 0.0f;
          food_[idx] = 0.0f;
        }
        if (eraseWall) {
          repellent_[idx] = 0.0f;
        }
      }
    }
  }
}

void FieldGrid::markVisited(Vec2 p) {
  const int x = static_cast<int>(std::round(p.x));
  const int y = static_cast<int>(std::round(p.y));
  if (!inBounds(x, y)) {
    return;
  }
  const int idx = index(x, y);
  if (!visited_[idx]) {
    visited_[idx] = 1;
    ++visitedCount_;
  }
}

double FieldGrid::coverage() const {
  if (visited_.empty()) {
    return 0.0;
  }
  return static_cast<double>(visitedCount_) / static_cast<double>(visited_.size());
}

double FieldGrid::totalTrail() const {
  double sum = 0.0;
  for (float v : trail_) {
    sum += v;
  }
  return sum;
}

void FieldGrid::rebuildFoodField(const std::vector<FoodSource>& foods, const Params& params) {
  std::fill(food_.begin(), food_.end(), 0.0f);
  for (const FoodSource& source : foods) {
    if (!source.enabled && params.depletedFoodSignal <= 0.0) {
      continue;
    }
    const double remaining = source.maxCalories > 0.0 ? source.calories / source.maxCalories : 0.0;
    const double normalizedStrength =
        std::max(0.0, source.attractorStrength / 20.0) *
        std::max(params.depletedFoodSignal, std::clamp(remaining, 0.0, 1.0));
    if (normalizedStrength <= 0.0) {
      continue;
    }
    const double scentRadius = std::max(source.radius * 7.0, params.sensorDistance * 5.0);
    const int minX = std::max(0, static_cast<int>(std::floor(source.position.x - scentRadius)));
    const int maxX = std::min(width_ - 1, static_cast<int>(std::ceil(source.position.x + scentRadius)));
    const int minY = std::max(0, static_cast<int>(std::floor(source.position.y - scentRadius)));
    const int maxY = std::min(height_ - 1, static_cast<int>(std::ceil(source.position.y + scentRadius)));
    const double invScale = 1.0 / std::max(1.0, scentRadius * 0.42);
    for (int y = minY; y <= maxY; ++y) {
      for (int x = minX; x <= maxX; ++x) {
        const double dx = x - source.position.x;
        const double dy = y - source.position.y;
        const double d = std::sqrt(dx * dx + dy * dy);
        if (d <= scentRadius) {
          const int idx = index(x, y);
          if (repellent_[idx] < 0.25f) {
            const double coreBoost = d <= source.radius ? 0.75 : 0.0;
            food_[idx] = static_cast<float>(
                std::min(4.0, static_cast<double>(food_[idx]) + normalizedStrength * std::exp(-d * invScale) + coreBoost));
          }
        }
      }
    }
  }
}

void FieldGrid::diffuseAndDecay(double dt, const Params& params) {
  if (trail_.empty()) {
    return;
  }
  const double diffusion = std::max(0.0, params.trailDiffusion);
  const int passes = std::max(1, static_cast<int>(std::ceil((diffusion * dt) / 0.20)));
  const double passDt = dt / static_cast<double>(passes);
  std::vector<float> next(trail_.size(), 0.0f);

  for (int pass = 0; pass < passes; ++pass) {
    const double decay = std::clamp(1.0 - params.trailDecay * passDt, 0.0, 1.0);
    for (int y = 0; y < height_; ++y) {
      for (int x = 0; x < width_; ++x) {
        const int idx = index(x, y);
        if (repellent_[idx] > 0.25f) {
          next[idx] = 0.0f;
          continue;
        }
        const float center = trail_[idx];
        const float left = trail_[index(std::max(0, x - 1), y)];
        const float right = trail_[index(std::min(width_ - 1, x + 1), y)];
        const float up = trail_[index(x, std::max(0, y - 1))];
        const float down = trail_[index(x, std::min(height_ - 1, y + 1))];
        const double laplacian = static_cast<double>(left + right + up + down - 4.0f * center);
        const double value = (static_cast<double>(center) + diffusion * passDt * laplacian) * decay;
        next[idx] = static_cast<float>(std::clamp(value, 0.0, params.trailMax));
      }
    }
    trail_.swap(next);
  }
}

void FieldGrid::writeRenderBuffer(std::vector<uint8_t>& rgba, const Params& params) const {
  rgba.resize(static_cast<std::size_t>(width_) * static_cast<std::size_t>(height_) * 4U);
  for (int y = 0; y < height_; ++y) {
    for (int x = 0; x < width_; ++x) {
      const int idx = index(x, y);
      const int out = idx * 4;
      double r = 7.0;
      double g = 10.0;
      double b = 14.0;
      if (params.showTrail) {
        const double t = std::pow(std::clamp(static_cast<double>(trail_[idx]) / std::max(1.0, params.trailMax), 0.0, 1.0), 0.58);
        r += 16.0 * t;
        g += 168.0 * t;
        b += 126.0 * t;
      }
      if (params.showFoodField) {
        const double f = std::pow(std::clamp(static_cast<double>(food_[idx]) / 1.7, 0.0, 1.0), 0.7);
        r += 188.0 * f;
        g += 110.0 * f;
        b += 8.0 * f;
      }
      if (repellent_[idx] > 0.1f) {
        const double w = std::clamp(static_cast<double>(repellent_[idx]), 0.0, 1.0);
        r = 88.0 + 94.0 * w;
        g = 24.0;
        b = 36.0;
      }
      rgba[out + 0] = static_cast<uint8_t>(std::clamp(r, 0.0, 255.0));
      rgba[out + 1] = static_cast<uint8_t>(std::clamp(g, 0.0, 255.0));
      rgba[out + 2] = static_cast<uint8_t>(std::clamp(b, 0.0, 255.0));
      rgba[out + 3] = 255;
    }
  }
}

} // namespace physarum
