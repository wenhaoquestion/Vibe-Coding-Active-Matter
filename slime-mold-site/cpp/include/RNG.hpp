#pragma once

#include <cstdint>
#include <limits>

namespace physarum {

class RNG {
public:
  explicit RNG(uint64_t seed = 1) { reseed(seed); }

  void reseed(uint64_t seed) {
    state_ = seed ? seed : 0x9e3779b97f4a7c15ULL;
    for (int i = 0; i < 4; ++i) {
      nextU64();
    }
  }

  uint64_t nextU64() {
    uint64_t x = state_;
    x ^= x >> 12;
    x ^= x << 25;
    x ^= x >> 27;
    state_ = x;
    return x * 2685821657736338717ULL;
  }

  double uniform() {
    constexpr double denom = static_cast<double>(std::numeric_limits<uint64_t>::max());
    return static_cast<double>(nextU64()) / denom;
  }

  double range(double lo, double hi) { return lo + (hi - lo) * uniform(); }
  int rangeInt(int lo, int hiInclusive) {
    return lo + static_cast<int>(nextU64() % static_cast<uint64_t>(hiInclusive - lo + 1));
  }

  bool chance(double p) { return uniform() < p; }

private:
  uint64_t state_ = 1;
};

} // namespace physarum
