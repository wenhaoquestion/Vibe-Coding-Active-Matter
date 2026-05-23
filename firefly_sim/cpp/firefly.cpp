#include "firefly.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>

namespace firefly {
namespace {

constexpr int kMaxFireflies = 3000;
constexpr int kHistoryLimit = 240;
constexpr int kMaxBats = 64;

float clamp(float value, float lo, float hi) {
  return std::max(lo, std::min(hi, value));
}

float distance(float ax, float ay, float bx, float by) {
  const float dx = ax - bx;
  const float dy = ay - by;
  return std::sqrt(dx * dx + dy * dy);
}

float distanceToSegment(float cx, float cy, float ax, float ay, float bx, float by) {
  const float vx = bx - ax;
  const float vy = by - ay;
  const float len2 = vx * vx + vy * vy;
  if (len2 <= 1e-9f) return distance(cx, cy, ax, ay);
  const float t = clamp(((cx - ax) * vx + (cy - ay) * vy) / len2, 0.0f, 1.0f);
  return distance(cx, cy, ax + t * vx, ay + t * vy);
}

}  // namespace

float wrapPhase(float theta) {
  float wrapped = std::fmod(theta, kTwoPi);
  if (wrapped < 0.0f) wrapped += kTwoPi;
  return wrapped;
}

float signedWrap(float theta) {
  return wrapPhase(theta + kPi) - kPi;
}

void Simulation::init(int, int, int seed) {
  reset(seed);
}

void Simulation::reset(int seed) {
  rng_.seed(static_cast<std::uint32_t>(seed == 0 ? 1 : seed));
  time_ = 0.0f;
  lastPsi_ = 0.0f;
  history_.clear();
  scanResults_.clear();
  estimatedKc_ = -1.0f;
  obstacles_.clear();
  cityLights_.clear();
  bats_.clear();
  if (params_.epsilon_city > 0.0f) {
    addCityLight(params_.L * 0.78f, params_.L * 0.28f, params_.L * 0.32f, params_.epsilon_city, params_.Omega_city);
  }
  fireflies_.clear();
  fireflies_.reserve(std::min(params_.N, kMaxFireflies));
  for (int i = 0; i < std::min(params_.N, kMaxFireflies); ++i) {
    fireflies_.push_back(makeFirefly(uniform_(rng_) * params_.L, uniform_(rng_) * params_.L, i));
  }
  const int desiredBats = std::min(params_.batCount, kMaxBats);
  for (int i = 0; i < desiredBats; ++i) {
    addBat(uniform_(rng_) * params_.L, uniform_(rng_) * params_.L);
  }
  computeMetrics(0.0f);
}

void Simulation::setParam(int paramId, double value) {
  switch (paramId) {
    case 0: params_.N = std::max(1, std::min(kMaxFireflies, static_cast<int>(value))); break;
    case 1: params_.L = std::max(1.0f, static_cast<float>(value)); break;
    case 2: params_.K = static_cast<float>(value); break;
    case 3: params_.R_visual = std::max(0.01f, static_cast<float>(value)); break;
    case 4: params_.D = std::max(0.0f, static_cast<float>(value)); break;
    case 5: params_.omega0 = static_cast<float>(value); break;
    case 6: params_.sigma_omega = std::max(0.0f, static_cast<float>(value)); break;
    case 7: params_.dt = std::max(0.0001f, static_cast<float>(value)); break;
    case 8: params_.sigma_flash = std::max(0.02f, static_cast<float>(value)); break;
    case 9: params_.epsilon_city = std::max(0.0f, static_cast<float>(value)); break;
    case 10: params_.Omega_city = static_cast<float>(value); break;
    case 11: params_.phi_city = static_cast<float>(value); break;
    case 12: params_.blockVisibility = value >= 0.5; break;
    case 13: params_.speciesMode = value >= 1.5 ? 2 : 1; break;
    case 14: params_.omega_A = static_cast<float>(value); break;
    case 15: params_.omega_B = static_cast<float>(value); break;
    case 16: params_.K_in = static_cast<float>(value); break;
    case 17: params_.K_out = static_cast<float>(value); break;
    case 18: params_.flashMode = std::max(0, std::min(2, static_cast<int>(value))); break;
    case 19: params_.mobilityEnabled = value >= 0.5; break;
    case 20: params_.v_firefly = std::max(0.0f, static_cast<float>(value)); break;
    case 21: params_.D_turn = std::max(0.0f, static_cast<float>(value)); break;
    case 22: params_.D_move = std::max(0.0f, static_cast<float>(value)); break;
    case 23: params_.R_avoid = std::max(0.01f, static_cast<float>(value)); break;
    case 24: params_.chi_bat = std::max(0.0f, static_cast<float>(value)); break;
    case 25: params_.predationEnabled = value >= 0.5; break;
    case 26: params_.batCount = std::max(0, std::min(kMaxBats, static_cast<int>(value))); break;
    case 27: params_.v_bat = std::max(0.0f, static_cast<float>(value)); break;
    case 28: params_.R_bat_perception = std::max(0.01f, static_cast<float>(value)); break;
    case 29: params_.R_capture = std::max(0.01f, static_cast<float>(value)); break;
    case 30: params_.batTurnNoise = std::max(0.0f, static_cast<float>(value)); break;
    default: break;
  }
  if (!fireflies_.empty() && static_cast<int>(fireflies_.size()) != params_.N) {
    if (static_cast<int>(fireflies_.size()) > params_.N) {
      fireflies_.resize(params_.N);
    } else {
      const int start = static_cast<int>(fireflies_.size());
      for (int i = start; i < params_.N; ++i) {
        fireflies_.push_back(makeFirefly(uniform_(rng_) * params_.L, uniform_(rng_) * params_.L, i));
      }
    }
  }
  if (static_cast<int>(bats_.size()) != params_.batCount) {
    const int desired = params_.batCount;
    if (static_cast<int>(bats_.size()) > desired) {
      bats_.resize(desired);
    } else {
      while (static_cast<int>(bats_.size()) < desired) {
        addBat(uniform_(rng_) * params_.L, uniform_(rng_) * params_.L);
      }
      params_.batCount = desired;
    }
  }
}

void Simulation::step(int steps) {
  for (int i = 0; i < steps; ++i) stepOnce(true);
}

void Simulation::addFireflies(float x, float y, int count, float radius) {
  const int start = static_cast<int>(fireflies_.size());
  for (int i = 0; i < count && static_cast<int>(fireflies_.size()) < kMaxFireflies; ++i) {
    const float angle = uniform_(rng_) * kTwoPi;
    const float r = std::sqrt(uniform_(rng_)) * radius;
    fireflies_.push_back(makeFirefly(x + std::cos(angle) * r, y + std::sin(angle) * r, start + i));
  }
  params_.N = static_cast<int>(fireflies_.size());
  computeMetrics(0.0f);
}

void Simulation::eraseFireflies(float x, float y, float radius) {
  fireflies_.erase(std::remove_if(fireflies_.begin(), fireflies_.end(), [&](const Firefly& f) {
                     return distance(f.x, f.y, x, y) <= radius;
                   }),
                   fireflies_.end());
  params_.N = static_cast<int>(fireflies_.size());
  computeMetrics(0.0f);
}

void Simulation::addObstacle(float x, float y, float radius) {
  obstacles_.push_back({clamp(x, 0.0f, params_.L), clamp(y, 0.0f, params_.L), std::max(0.01f, radius), 1});
  computeMetrics(0.0f);
}

void Simulation::eraseObstacles(float x, float y, float radius) {
  obstacles_.erase(std::remove_if(obstacles_.begin(), obstacles_.end(), [&](const Obstacle& obstacle) {
                     return distance(obstacle.x, obstacle.y, x, y) <= radius + obstacle.radius;
                   }),
                   obstacles_.end());
  computeMetrics(0.0f);
}

void Simulation::clearObstacles() {
  obstacles_.clear();
  computeMetrics(0.0f);
}

void Simulation::addCityLight(float x, float y, float radius, float epsilon, float omega) {
  cityLights_.push_back({clamp(x, 0.0f, params_.L), clamp(y, 0.0f, params_.L), std::max(0.01f, radius), epsilon, omega, params_.phi_city, 1});
}

void Simulation::eraseCityLights(float x, float y, float radius) {
  cityLights_.erase(std::remove_if(cityLights_.begin(), cityLights_.end(), [&](const CityLight& light) {
                       return distance(light.x, light.y, x, y) <= radius + light.radius;
                     }),
                     cityLights_.end());
}

void Simulation::clearCityLights() {
  cityLights_.clear();
}

void Simulation::addBat(float x, float y) {
  if (static_cast<int>(bats_.size()) >= kMaxBats) return;
  const float heading = uniform_(rng_) * kTwoPi;
  Bat bat;
  bat.x = clamp(x, 0.0f, params_.L);
  bat.y = clamp(y, 0.0f, params_.L);
  bat.heading = heading;
  bat.speed = params_.v_bat;
  bat.vx = std::cos(heading) * params_.v_bat;
  bat.vy = std::sin(heading) * params_.v_bat;
  bat.perceptionRadius = params_.R_bat_perception;
  bat.captureRadius = params_.R_capture;
  bats_.push_back(bat);
  params_.batCount = static_cast<int>(bats_.size());
}

void Simulation::eraseBats(float x, float y, float radius) {
  bats_.erase(std::remove_if(bats_.begin(), bats_.end(), [&](const Bat& bat) {
                return distance(bat.x, bat.y, x, y) <= radius;
              }),
              bats_.end());
  params_.batCount = static_cast<int>(bats_.size());
  computeMetrics(0.0f);
}

void Simulation::clearBats() {
  bats_.clear();
  params_.batCount = 0;
  for (auto& f : fireflies_) f.panic = 0.0f;
  computeMetrics(0.0f);
}

void Simulation::runScan(int kind, float minValue, float maxValue, int samples, int steps, int burnIn, float threshold) {
  const auto baseParams = params_;
  const auto baseFireflies = fireflies_;
  const auto baseObstacles = obstacles_;
  const auto baseLights = cityLights_;
  const auto baseBats = bats_;
  const auto baseMetrics = metrics_;
  const float baseTime = time_;
  const float basePsi = lastPsi_;

  scanResults_.clear();
  estimatedKc_ = -1.0f;
  samples = std::max(1, samples);
  for (int i = 0; i < samples; ++i) {
    const float value = samples == 1 ? minValue : minValue + (maxValue - minValue) * static_cast<float>(i) / static_cast<float>(samples - 1);
    params_ = baseParams;
    fireflies_ = baseFireflies;
    obstacles_ = baseObstacles;
    cityLights_ = baseLights;
    bats_ = baseBats;
    time_ = baseTime;
    lastPsi_ = basePsi;
    if (kind == 0) params_.K = value;
    if (kind == 1) params_.R_visual = value;
    if (kind == 2) params_.D = value;
    if (kind == 3) params_.chi_bat = value;
    if (kind == 4) setParam(26, std::round(value));
    float sum = 0.0f;
    int count = 0;
    for (int stepIndex = 0; stepIndex < steps; ++stepIndex) {
      stepOnce(false);
      if (stepIndex >= burnIn) {
        sum += metrics_.r;
        ++count;
      }
    }
    const float rBar = count > 0 ? sum / static_cast<float>(count) : metrics_.r;
    scanResults_.push_back({value, rBar});
    if (estimatedKc_ < 0.0f && rBar >= threshold) estimatedKc_ = value;
  }
  params_ = baseParams;
  fireflies_ = baseFireflies;
  obstacles_ = baseObstacles;
  cityLights_ = baseLights;
  bats_ = baseBats;
  metrics_ = baseMetrics;
  time_ = baseTime;
  lastPsi_ = basePsi;
}

bool Simulation::canSee(const Firefly& a, const Firefly& b) const {
  if (!a.alive || !b.alive) return false;
  if (distance(a.x, a.y, b.x, b.y) > params_.R_visual) return false;
  if (!params_.blockVisibility) return true;
  for (const auto& obstacle : obstacles_) {
    if (obstacle.active && distanceToSegment(obstacle.x, obstacle.y, a.x, a.y, b.x, b.y) <= obstacle.radius) return false;
  }
  return true;
}

void Simulation::computeMetrics(float flashCount) {
  int aliveCount = 0;
  for (const auto& f : fireflies_) {
    if (f.alive) ++aliveCount;
  }
  const int n = std::max(1, aliveCount);
  float sx = 0.0f;
  float sy = 0.0f;
  float sxA = 0.0f;
  float syA = 0.0f;
  float sxB = 0.0f;
  float syB = 0.0f;
  int nA = 0;
  int nB = 0;
  float localSum = 0.0f;
  int neighborSum = 0;
  int isolated = 0;
  float panicSum = 0.0f;
  float nearestBatSum = 0.0f;
  float targeted = 0.0f;
  for (const auto& bat : bats_) {
    if (bat.active && bat.targetIndex >= 0) targeted += 1.0f;
  }
  for (auto& f : fireflies_) {
    if (!f.alive) {
      f.localOrder = 0.0f;
      f.neighborCount = 0;
      continue;
    }
    sx += std::cos(f.theta);
    sy += std::sin(f.theta);
    if (f.species == 0) {
      sxA += std::cos(f.theta);
      syA += std::sin(f.theta);
      ++nA;
    } else {
      sxB += std::cos(f.theta);
      syB += std::sin(f.theta);
      ++nB;
    }
    float lx = 0.0f;
    float ly = 0.0f;
    int k = 0;
    for (const auto& other : fireflies_) {
      if (&f == &other || !canSee(f, other)) continue;
      lx += std::cos(other.theta);
      ly += std::sin(other.theta);
      ++k;
    }
    f.neighborCount = k;
    f.localOrder = k > 0 ? std::sqrt((lx / k) * (lx / k) + (ly / k) * (ly / k)) : 0.0f;
    localSum += f.localOrder;
    neighborSum += k;
    if (k == 0) ++isolated;
    panicSum += f.panic;
    float nearest = params_.L * 2.0f;
    for (const auto& bat : bats_) {
      if (bat.active) nearest = std::min(nearest, distance(f.x, f.y, bat.x, bat.y));
    }
    nearestBatSum += bats_.empty() ? params_.L : nearest;
  }
  const float psi = std::atan2(sy, sx);
  const float dPsi = signedWrap(psi - lastPsi_) / std::max(params_.dt, 1e-6f);
  lastPsi_ = psi;
  metrics_ = {
      std::sqrt((sx / n) * (sx / n) + (sy / n) * (sy / n)),
      psi,
      localSum / n,
      static_cast<float>(neighborSum) / n,
      static_cast<float>(isolated),
      flashCount,
      std::abs(dPsi - params_.Omega_city),
      nA > 0 ? std::sqrt((sxA / nA) * (sxA / nA) + (syA / nA) * (syA / nA)) : 0.0f,
      nB > 0 ? std::sqrt((sxB / nB) * (sxB / nB) + (syB / nB) * (syB / nB)) : 0.0f,
      static_cast<float>(aliveCount),
      static_cast<float>(fireflies_.size() - aliveCount),
      panicSum / n,
      nearestBatSum / n,
      targeted};
}

Firefly Simulation::makeFirefly(float x, float y, int index) {
  const std::uint8_t species = params_.speciesMode == 2 && index % 2 == 1 ? 1 : 0;
  const float mean = params_.speciesMode == 2 ? (species == 0 ? params_.omega_A : params_.omega_B) : params_.omega0;
  const float heading = uniform_(rng_) * kTwoPi;
  Firefly f;
  f.x = clamp(x, 0.0f, params_.L);
  f.y = clamp(y, 0.0f, params_.L);
  f.heading = heading;
  f.speed = params_.v_firefly;
  f.vx = std::cos(heading) * params_.v_firefly;
  f.vy = std::sin(heading) * params_.v_firefly;
  f.theta = uniform_(rng_) * kTwoPi;
  f.omega = mean + params_.sigma_omega * normal_(rng_);
  f.species = species;
  return f;
}

void Simulation::reflectInBounds(float& x, float& y, float& vx, float& vy, float& heading) const {
  if (x < 0.0f) {
    x = -x;
    vx = std::abs(vx);
  } else if (x > params_.L) {
    x = 2.0f * params_.L - x;
    vx = -std::abs(vx);
  }
  if (y < 0.0f) {
    y = -y;
    vy = std::abs(vy);
  } else if (y > params_.L) {
    y = 2.0f * params_.L - y;
    vy = -std::abs(vy);
  }
  x = clamp(x, 0.0f, params_.L);
  y = clamp(y, 0.0f, params_.L);
  if (std::abs(vx) + std::abs(vy) > 1e-6f) heading = std::atan2(vy, vx);
}

void Simulation::updateBats() {
  if (bats_.empty()) return;
  const float turnScale = std::sqrt(std::max(0.0f, 2.0f * params_.batTurnNoise * params_.dt));
  for (auto& bat : bats_) {
    if (!bat.active) continue;
    bat.speed = params_.v_bat;
    bat.perceptionRadius = params_.R_bat_perception;
    bat.captureRadius = params_.R_capture;
    bat.targetIndex = -1;
    float bestScore = -1.0f;
    for (std::size_t i = 0; i < fireflies_.size(); ++i) {
      const auto& f = fireflies_[i];
      if (!f.alive) continue;
      const float d = distance(bat.x, bat.y, f.x, f.y);
      if (d > bat.perceptionRadius) continue;
      const float score = f.brightness / (d + 0.05f);
      if (score > bestScore) {
        bestScore = score;
        bat.targetIndex = static_cast<int>(i);
      }
    }
    if (bat.targetIndex >= 0) {
      const auto& target = fireflies_[bat.targetIndex];
      const float desired = std::atan2(target.y - bat.y, target.x - bat.x);
      bat.heading = wrapPhase(bat.heading + signedWrap(desired - bat.heading) * 0.22f);
    } else {
      bat.heading = wrapPhase(bat.heading + turnScale * normal_(rng_));
    }
    bat.vx = std::cos(bat.heading) * bat.speed;
    bat.vy = std::sin(bat.heading) * bat.speed;
    bat.x += bat.vx * params_.dt;
    bat.y += bat.vy * params_.dt;
    reflectInBounds(bat.x, bat.y, bat.vx, bat.vy, bat.heading);
  }
}

void Simulation::updateFireflyMotion() {
  if (!params_.mobilityEnabled && bats_.empty()) return;
  const float turnScale = std::sqrt(std::max(0.0f, 2.0f * params_.D_turn * params_.dt));
  const float moveScale = std::sqrt(std::max(0.0f, 2.0f * params_.D_move * params_.dt));
  for (auto& f : fireflies_) {
    if (!f.alive) continue;
    float avoidX = 0.0f;
    float avoidY = 0.0f;
    float panic = 0.0f;
    for (const auto& bat : bats_) {
      if (!bat.active) continue;
      const float dx = f.x - bat.x;
      const float dy = f.y - bat.y;
      const float d = std::sqrt(dx * dx + dy * dy);
      if (d < params_.R_avoid) {
        const float weight = 1.0f - d / std::max(params_.R_avoid, 1e-6f);
        avoidX += params_.chi_bat * weight * dx / (d + 1e-4f);
        avoidY += params_.chi_bat * weight * dy / (d + 1e-4f);
        panic = std::max(panic, weight);
      }
      if (params_.predationEnabled && d < params_.R_capture) {
        f.alive = 0;
        f.brightness = 0.0f;
        f.panic = 1.0f;
      }
    }
    if (!f.alive) continue;
    f.panic = panic;
    if (params_.mobilityEnabled) {
      f.heading = wrapPhase(f.heading + turnScale * normal_(rng_));
      f.speed = params_.v_firefly;
      f.vx = std::cos(f.heading) * f.speed + avoidX + moveScale * normal_(rng_);
      f.vy = std::sin(f.heading) * f.speed + avoidY + moveScale * normal_(rng_);
      f.x += f.vx * params_.dt;
      f.y += f.vy * params_.dt;
      reflectInBounds(f.x, f.y, f.vx, f.vy, f.heading);
    }
  }
}

bool Simulation::isInsideBatPerception(const Firefly& firefly) const {
  if (!firefly.alive) return false;
  for (const auto& bat : bats_) {
    if (!bat.active) continue;
    if (distance(firefly.x, firefly.y, bat.x, bat.y) <= bat.perceptionRadius) return true;
  }
  return false;
}

void Simulation::stepOnce(bool record) {
  updateBats();
  updateFireflyMotion();
  std::vector<float> next(fireflies_.size(), 0.0f);
  const float noiseScale = std::sqrt(std::max(0.0f, 2.0f * params_.D * params_.dt));
  float flashes = 0.0f;
  for (std::size_t i = 0; i < fireflies_.size(); ++i) {
    const auto& current = fireflies_[i];
    if (!current.alive) {
      next[i] = current.theta;
      continue;
    }
    if (isInsideBatPerception(current)) {
      next[i] = current.theta;
      fireflies_[i].neighborCount = 0;
      continue;
    }
    float coupling = 0.0f;
    int neighbors = 0;
    for (std::size_t j = 0; j < fireflies_.size(); ++j) {
      if (i == j || !canSee(current, fireflies_[j])) continue;
      coupling += couplingFor(current, fireflies_[j]) * std::sin(fireflies_[j].theta - current.theta);
      ++neighbors;
    }
    float drive = 0.0f;
    for (const auto& light : cityLights_) {
      if (!light.active || light.epsilon <= 0.0f) continue;
      const float d = distance(current.x, current.y, light.x, light.y);
      const float falloff = d <= light.radius ? 1.0f - d / std::max(light.radius, 1e-6f) : 0.0f;
      drive += light.epsilon * falloff * std::sin(light.omega * time_ + light.phase - current.theta);
    }
    const float theta = wrapPhase(current.theta + (current.omega + (neighbors > 0 ? coupling / neighbors : 0.0f) + drive) * params_.dt + noiseScale * normal_(rng_));
    if (current.theta > theta) flashes += 1.0f;
    next[i] = theta;
    fireflies_[i].neighborCount = neighbors;
  }
  for (std::size_t i = 0; i < fireflies_.size(); ++i) {
    fireflies_[i].theta = next[i];
    fireflies_[i].brightness = fireflies_[i].alive && !isInsideBatPerception(fireflies_[i]) ? brightness(next[i]) : 0.0f;
  }
  time_ += params_.dt;
  computeMetrics(flashes);
  if (record) pushHistory();
}

float Simulation::brightness(float theta) const {
  if (params_.flashMode == 0) return theta < params_.dt * std::max(params_.omega0, 1.0f) ? 1.0f : 0.08f;
  if (params_.flashMode == 1) return (1.0f + std::cos(theta)) * 0.5f;
  const float w = signedWrap(theta);
  return std::exp(-(w * w) / (2.0f * params_.sigma_flash * params_.sigma_flash));
}

float Simulation::couplingFor(const Firefly& a, const Firefly& b) const {
  if (params_.speciesMode == 2) return a.species == b.species ? params_.K_in : params_.K_out;
  return params_.K;
}

void Simulation::pushHistory() {
  history_.push_back(metrics_);
  if (history_.size() > kHistoryLimit) history_.erase(history_.begin());
}

}  // namespace firefly
