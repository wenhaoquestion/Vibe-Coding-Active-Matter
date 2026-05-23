#include "Simulation.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cmath>
#include <iomanip>
#include <limits>
#include <sstream>

namespace physarum {

namespace {

constexpr double kPi = 3.1415926535897932384626433832795;
constexpr double kTwoPi = 2.0 * kPi;

bool readNumber(const std::string& json, const std::string& key, double& out) {
  const std::string needle = "\"" + key + "\"";
  const std::size_t keyPos = json.find(needle);
  if (keyPos == std::string::npos) {
    return false;
  }
  const std::size_t colon = json.find(':', keyPos + needle.size());
  if (colon == std::string::npos) {
    return false;
  }
  const char* begin = json.c_str() + colon + 1;
  char* end = nullptr;
  const double value = std::strtod(begin, &end);
  if (begin == end || !std::isfinite(value)) {
    return false;
  }
  out = value;
  return true;
}

bool readBool(const std::string& json, const std::string& key, bool& out) {
  const std::string needle = "\"" + key + "\"";
  const std::size_t keyPos = json.find(needle);
  if (keyPos == std::string::npos) {
    return false;
  }
  const std::size_t colon = json.find(':', keyPos + needle.size());
  if (colon == std::string::npos) {
    return false;
  }
  std::size_t pos = colon + 1;
  while (pos < json.size() && std::isspace(static_cast<unsigned char>(json[pos]))) {
    ++pos;
  }
  if (json.compare(pos, 4, "true") == 0 || json.compare(pos, 1, "1") == 0) {
    out = true;
    return true;
  }
  if (json.compare(pos, 5, "false") == 0 || json.compare(pos, 1, "0") == 0) {
    out = false;
    return true;
  }
  return false;
}

double objectNumber(const std::string& object, const std::string& key, double fallback) {
  double value = fallback;
  readNumber(object, key, value);
  return value;
}

bool objectBool(const std::string& object, const std::string& key, bool fallback) {
  bool value = fallback;
  readBool(object, key, value);
  return value;
}

std::vector<std::string> objectsInArray(const std::string& json, const std::string& key) {
  std::vector<std::string> objects;
  const std::string needle = "\"" + key + "\"";
  const std::size_t keyPos = json.find(needle);
  if (keyPos == std::string::npos) {
    return objects;
  }
  const std::size_t open = json.find('[', keyPos + needle.size());
  if (open == std::string::npos) {
    return objects;
  }
  int arrayDepth = 0;
  int objectDepth = 0;
  std::size_t objectStart = std::string::npos;
  for (std::size_t i = open; i < json.size(); ++i) {
    const char c = json[i];
    if (c == '[') {
      ++arrayDepth;
    } else if (c == ']') {
      --arrayDepth;
      if (arrayDepth == 0) {
        break;
      }
    } else if (c == '{' && arrayDepth == 1) {
      if (objectDepth == 0) {
        objectStart = i;
      }
      ++objectDepth;
    } else if (c == '}' && arrayDepth == 1) {
      --objectDepth;
      if (objectDepth == 0 && objectStart != std::string::npos) {
        objects.push_back(json.substr(objectStart, i - objectStart + 1));
        objectStart = std::string::npos;
      }
    }
  }
  return objects;
}

} // namespace

Simulation::Simulation(int width, int height, uint64_t seed)
    : width_(std::max(8, width)),
      height_(std::max(8, height)),
      seed_(seed),
      rng_(seed),
      fields_(width_, height_) {
  updateRenderBuffers();
  updateStatsCache();
  networkCache_ = "{\"nodes\":[],\"edges\":[],\"metrics\":{}}";
}

void Simulation::reset(uint64_t seed) {
  seed_ = seed ? seed : seed_;
  rng_.reseed(seed_);
  nextAgentId_ = 1;
  nextFoodId_ = 1;
  time_ = 0.0;
  networkAccumulator_ = 0.0;
  avgSearchProbability_ = 0.0;
  searchRatio_ = 0.0;
  agents_.clear();
  foods_.clear();
  fields_.clear();
  solver_.reset();
  updateRenderBuffers();
  updateStatsCache();
}

void Simulation::setParamsJson(const char* jsonPtr) {
  const std::string json = jsonPtr ? std::string(jsonPtr) : std::string("{}");
  auto num = [&](const char* key, double& field) {
    double value = field;
    if (readNumber(json, key, value)) {
      field = value;
    }
  };
  auto integer = [&](const char* key, int& field) {
    double value = static_cast<double>(field);
    if (readNumber(json, key, value)) {
      field = static_cast<int>(std::round(value));
    }
  };
  auto boolean = [&](const char* key, int& field) {
    bool value = field != 0;
    if (readBool(json, key, value)) {
      field = value ? 1 : 0;
    }
  };

  integer("targetAgentCount", params_.targetAgentCount);
  integer("maxAgents", params_.maxAgents);
  integer("randomSeed", params_.randomSeed);
  integer("boundaryMode", params_.boundaryMode);
  integer("brushAgents", params_.brushAgents);
  integer("substeps", params_.substeps);
  integer("graphStride", params_.graphStride);
  integer("pressureIterations", params_.pressureIterations);
  boolean("solverEnabled", params_.solverEnabled);
  boolean("showTrail", params_.showTrail);
  boolean("showAgents", params_.showAgents);
  boolean("showFoodField", params_.showFoodField);
  boolean("showNetwork", params_.showNetwork);
  boolean("showShortestPath", params_.showShortestPath);

  num("energyMax", params_.energyMax);
  num("initialEnergy", params_.initialEnergy);
  num("sensorAngle", params_.sensorAngle);
  num("sensorDistance", params_.sensorDistance);
  num("rotationAngle", params_.rotationAngle);
  num("speedMin", params_.speedMin);
  num("speedMax", params_.speedMax);
  num("trailDeposit", params_.trailDeposit);
  num("trailDiffusion", params_.trailDiffusion);
  num("trailDecay", params_.trailDecay);
  num("trailMax", params_.trailMax);
  num("trailWeight", params_.trailWeight);
  num("foodWeight", params_.foodWeight);
  num("repellentWeight", params_.repellentWeight);
  num("randomSensorNoise", params_.randomSensorNoise);
  num("searchRandomness", params_.searchRandomness);
  num("baseEnergyCost", params_.baseEnergyCost);
  num("moveEnergyCost", params_.moveEnergyCost);
  num("sensorEnergyCost", params_.sensorEnergyCost);
  num("trailEnergyCost", params_.trailEnergyCost);
  num("eatRate", params_.eatRate);
  num("foodEnergyEfficiency", params_.foodEnergyEfficiency);
  num("foodAttractionGamma", params_.foodAttractionGamma);
  num("depletedFoodSignal", params_.depletedFoodSignal);
  num("splitEnergyThreshold", params_.splitEnergyThreshold);
  num("splitProbability", params_.splitProbability);
  num("splitRatio", params_.splitRatio);
  num("splitAngle", params_.splitAngle);
  num("deathEnergyThreshold", params_.deathEnergyThreshold);
  num("deathTime", params_.deathTime);
  num("lowEnergyThreshold", params_.lowEnergyThreshold);
  num("searchA0", params_.searchA0);
  num("searchAE", params_.searchAE);
  num("searchAF", params_.searchAF);
  num("searchAT", params_.searchAT);
  num("searchAN", params_.searchAN);
  num("searchAC", params_.searchAC);
  num("foodCalories", params_.foodCalories);
  num("foodRadius", params_.foodRadius);
  num("attractorStrength", params_.attractorStrength);
  num("brushRadius", params_.brushRadius);
  num("trailThreshold", params_.trailThreshold);
  num("pressureTolerance", params_.pressureTolerance);
  num("conductivityAlpha", params_.conductivityAlpha);
  num("conductivityMu", params_.conductivityMu);
  num("conductivityDecay", params_.conductivityDecay);
  num("conductivityMin", params_.conductivityMin);
  num("conductivityMax", params_.conductivityMax);
  num("lambdaEnergy", params_.lambdaEnergy);

  params_.maxAgents = std::max(1, params_.maxAgents);
  params_.energyMax = std::max(1.0, params_.energyMax);
  params_.trailMax = std::max(1.0, params_.trailMax);
  params_.graphStride = std::clamp(params_.graphStride, 3, 32);
  params_.substeps = std::clamp(params_.substeps, 1, 12);
  updateRenderBuffers();
}

void Simulation::addAgents(double x, double y, int count, double radius) {
  if (count <= 0 || radius < 0.0) {
    return;
  }
  const int room = std::max(0, params_.maxAgents - static_cast<int>(agents_.size()));
  count = std::min(count, room);
  for (int i = 0; i < count; ++i) {
    Agent agent;
    agent.id = nextAgentId_++;
    const double r = radius * std::sqrt(rng_.uniform());
    const double a = rng_.range(0.0, kTwoPi);
    agent.position = Vec2{std::clamp(x + r * std::cos(a), 0.0, static_cast<double>(width_ - 1)),
                          std::clamp(y + r * std::sin(a), 0.0, static_cast<double>(height_ - 1))};
    for (int attempt = 0; attempt < 6 && fields_.sampleRepellent(agent.position.x, agent.position.y) > 0.2f; ++attempt) {
      const double rr = radius * std::sqrt(rng_.uniform());
      const double aa = rng_.range(0.0, kTwoPi);
      agent.position = Vec2{std::clamp(x + rr * std::cos(aa), 0.0, static_cast<double>(width_ - 1)),
                            std::clamp(y + rr * std::sin(aa), 0.0, static_cast<double>(height_ - 1))};
    }
    agent.angle = rng_.range(0.0, kTwoPi);
    agent.energy = std::clamp(params_.initialEnergy * rng_.range(0.82, 1.10), 0.0, params_.energyMax);
    agent.bestDirection = agent.angle;
    agents_.push_back(agent);
  }
  updateRenderBuffers();
}

void Simulation::addFood(double x, double y, double calories, double radius, double attractorStrength) {
  FoodSource food;
  food.id = nextFoodId_++;
  food.position = Vec2{std::clamp(x, 0.0, static_cast<double>(width_ - 1)),
                       std::clamp(y, 0.0, static_cast<double>(height_ - 1))};
  food.calories = std::max(0.0, calories);
  food.maxCalories = std::max(1.0, calories);
  food.radius = std::max(1.0, radius);
  food.attractorStrength = std::max(0.0, attractorStrength);
  food.enabled = food.calories > 0.0;
  foods_.push_back(food);
  fields_.rebuildFoodField(foods_, params_);
  updateRenderBuffers();
}

void Simulation::eraseAt(double x,
                         double y,
                         double radius,
                         bool eraseSlime,
                         bool eraseFood,
                         bool eraseTrail,
                         bool eraseWall) {
  const Vec2 p{x, y};
  const double r2 = radius * radius;
  if (eraseSlime) {
    for (Agent& agent : agents_) {
      if (!agent.alive) {
        continue;
      }
      const double dx = agent.position.x - p.x;
      const double dy = agent.position.y - p.y;
      if (dx * dx + dy * dy <= r2) {
        agent.alive = false;
      }
    }
  }
  if (eraseFood) {
    for (FoodSource& food : foods_) {
      const double dx = food.position.x - p.x;
      const double dy = food.position.y - p.y;
      const double rr = radius + food.radius;
      if (dx * dx + dy * dy <= rr * rr) {
        food.calories = 0.0;
        food.enabled = false;
      }
    }
  }
  fields_.eraseCircle(p, radius, eraseTrail, eraseWall);
  updateRenderBuffers();
}

void Simulation::addWall(double x, double y, double radius) {
  fields_.addWall(Vec2{x, y}, std::max(1.0, radius));
  updateRenderBuffers();
}

double Simulation::normalizeAngle(double a) const {
  a = std::fmod(a, kTwoPi);
  if (a < 0.0) {
    a += kTwoPi;
  }
  return a;
}

double Simulation::circularMix(double from, double to, double t) const {
  const double delta = std::atan2(std::sin(to - from), std::cos(to - from));
  return normalizeAngle(from + std::clamp(t, 0.0, 1.0) * delta);
}

double Simulation::sigmoid(double x) const { return 1.0 / (1.0 + std::exp(-std::clamp(x, -60.0, 60.0))); }

double Simulation::agentSpeed(double energy) const {
  const double e = clamp01(energy / std::max(1.0, params_.energyMax));
  return params_.speedMin + (params_.speedMax - params_.speedMin) * e;
}

void Simulation::applyBoundary(Vec2& oldPos, Vec2& newPos, double& angle) {
  if (params_.boundaryMode == 0) {
    if (newPos.x < 0.0) {
      newPos.x += width_;
    }
    if (newPos.x >= width_) {
      newPos.x -= width_;
    }
    if (newPos.y < 0.0) {
      newPos.y += height_;
    }
    if (newPos.y >= height_) {
      newPos.y -= height_;
    }
    return;
  }
  if (newPos.x < 0.0 || newPos.x > width_ - 1) {
    newPos.x = std::clamp(newPos.x, 0.0, static_cast<double>(width_ - 1));
    angle = kPi - angle;
  }
  if (newPos.y < 0.0 || newPos.y > height_ - 1) {
    newPos.y = std::clamp(newPos.y, 0.0, static_cast<double>(height_ - 1));
    angle = -angle;
  }
  oldPos.x = std::clamp(oldPos.x, 0.0, static_cast<double>(width_ - 1));
  oldPos.y = std::clamp(oldPos.y, 0.0, static_cast<double>(height_ - 1));
}

void Simulation::stepAgent(Agent& agent, double dt, std::vector<Agent>& born) {
  if (!agent.alive) {
    return;
  }

  agent.age += dt;
  const double energyNorm = clamp01(agent.energy / std::max(1.0, params_.energyMax));
  const double localTrail = clamp01(fields_.sampleTrail(agent.position.x, agent.position.y) / params_.trailMax);
  const double localFood = clamp01(fields_.sampleFood(agent.position.x, agent.position.y) / 1.8);
  const double novelty = clamp01(1.0 - localTrail);
  const double localCost = clamp01(1.0 / (0.2 + 2.2 * localTrail) - 0.25);

  // Search-versus-exploit probability, see docs/model.tex Eq. (eq:p-search).
  const double pSearch = sigmoid(params_.searchA0 + params_.searchAE * energyNorm - params_.searchAF * localFood -
                                 params_.searchAT * localTrail + params_.searchAN * novelty -
                                 params_.searchAC * localCost);
  agent.searchMode = rng_.chance(pSearch);
  agent.carriedNutrient = pSearch;
  agent.recentFoodSignal = localFood;
  agent.novelty = novelty;

  const double trailWeight = params_.trailWeight * (agent.searchMode ? 0.65 : 1.28);
  const double foodWeight = params_.foodWeight * (agent.searchMode ? 0.72 : 1.35);
  const double noise = params_.randomSensorNoise * (agent.searchMode ? (1.0 + params_.searchRandomness * 2.0) : 0.65);

  auto sense = [&](double offset) {
    const double theta = agent.angle + offset;
    const Vec2 probe{agent.position.x + params_.sensorDistance * std::cos(theta),
                     agent.position.y + params_.sensorDistance * std::sin(theta)};
    // S_k = w_T T(x_k) + w_F F(x_k) - w_R R(x_k) + eta_k.
    return trailWeight * fields_.sampleTrail(probe.x, probe.y) / params_.trailMax +
           foodWeight * fields_.sampleFood(probe.x, probe.y) -
           params_.repellentWeight * fields_.sampleRepellent(probe.x, probe.y) +
           rng_.range(-noise, noise);
  };

  const double sFront = sense(0.0);
  const double sLeft = sense(params_.sensorAngle);
  const double sRight = sense(-params_.sensorAngle);
  const double randomFactor = rng_.range(0.65, 1.35);
  if (sFront > sLeft && sFront > sRight) {
    // Keep direction.
  } else if (sFront < sLeft && sFront < sRight) {
    agent.angle += (rng_.chance(0.5) ? 1.0 : -1.0) * params_.rotationAngle * randomFactor;
  } else if (sLeft > sRight) {
    agent.angle += params_.rotationAngle * randomFactor;
  } else if (sRight > sLeft) {
    agent.angle -= params_.rotationAngle * randomFactor;
  } else {
    agent.angle += rng_.range(-0.18, 0.18);
  }
  agent.angle = normalizeAngle(agent.angle);

  Vec2 foodForce{0.0, 0.0};
  double nearestFood = std::numeric_limits<double>::max();
  for (const FoodSource& food : foods_) {
    if (!food.enabled || food.calories <= 0.0 || food.maxCalories <= 0.0) {
      continue;
    }
    const Vec2 d{food.position.x - agent.position.x, food.position.y - agent.position.y};
    const double d2 = d.x * d.x + d.y * d.y;
    nearestFood = std::min(nearestFood, std::sqrt(d2));
    const double c = food.attractorStrength * std::clamp(food.calories / food.maxCalories, 0.0, 1.0);
    foodForce.x += c * d.x / (d2 + 25.0);
    foodForce.y += c * d.y / (d2 + 25.0);
  }
  agent.lastFoodDistance = nearestFood;
  const double forceNorm = safeLength(foodForce);
  if (forceNorm > 1e-8) {
    // beta_i = clamp(||F_food|| (1 - E_i/E_max)^gamma, 0, 1).
    const double hunger = std::pow(1.0 - energyNorm, params_.foodAttractionGamma);
    const double beta = clamp01(forceNorm * hunger * (agent.searchMode ? 0.45 : 0.85));
    agent.angle = circularMix(agent.angle, safeAtan2(foodForce), beta);
  }

  double speed = agentSpeed(agent.energy);
  const double dormancy = agent.energy < params_.lowEnergyThreshold
                              ? std::clamp(agent.energy / std::max(1.0, params_.lowEnergyThreshold), 0.15, 1.0)
                              : 1.0;
  speed *= dormancy;

  Vec2 oldPos = agent.position;
  Vec2 newPos{agent.position.x + speed * dt * std::cos(agent.angle),
              agent.position.y + speed * dt * std::sin(agent.angle)};
  // p_i(t + dt) = p_i(t) + v_i(E_i) dt u(theta_i).
  applyBoundary(oldPos, newPos, agent.angle);
  if (fields_.sampleRepellent(newPos.x, newPos.y) > 0.2f) {
    newPos = oldPos;
    agent.angle = normalizeAngle(agent.angle + kPi + rng_.range(-0.55, 0.55));
  }
  agent.position = newPos;
  fields_.markVisited(agent.position);

  double energyFromFood = 0.0;
  for (FoodSource& food : foods_) {
    if (!food.enabled || food.calories <= 0.0) {
      continue;
    }
    const double dx = food.position.x - agent.position.x;
    const double dy = food.position.y - agent.position.y;
    if (dx * dx + dy * dy <= food.radius * food.radius) {
      const double consume = std::min(food.calories, params_.eatRate * dt);
      food.calories -= consume;
      energyFromFood += params_.foodEnergyEfficiency * consume;
      if (food.calories <= 1e-6) {
        food.calories = 0.0;
        food.enabled = false;
      }
      break;
    }
  }

  const double q = params_.trailDeposit * energyNorm * dormancy;
  fields_.addTrail(agent.position, q * dt, params_.trailMax);
  // Energy budget, see docs/model.tex Eq. (eq:energy-budget).
  agent.energy = std::clamp(agent.energy - params_.baseEnergyCost * dt - params_.moveEnergyCost * speed * dt -
                                params_.sensorEnergyCost * 3.0 * dt - params_.trailEnergyCost * q * dt +
                                energyFromFood,
                            0.0,
                            params_.energyMax);

  if (agent.energy <= params_.deathEnergyThreshold) {
    agent.starvationTimer += dt;
  } else {
    agent.starvationTimer = 0.0;
  }
  if (agent.starvationTimer > params_.deathTime) {
    agent.alive = false;
    return;
  }

  if (agent.energy > params_.splitEnergyThreshold &&
      static_cast<int>(agents_.size() + born.size()) < params_.maxAgents &&
      rng_.chance(std::max(0.0, params_.splitProbability) * dt)) {
    Agent child = agent;
    child.id = nextAgentId_++;
    child.age = 0.0;
    child.starvationTimer = 0.0;
    child.energy = agent.energy * std::clamp(params_.splitRatio, 0.05, 0.95);
    agent.energy = agent.energy * (1.0 - std::clamp(params_.splitRatio, 0.05, 0.95));
    child.angle = normalizeAngle(agent.angle + rng_.range(-params_.splitAngle, params_.splitAngle));
    child.position.x = std::clamp(agent.position.x + rng_.range(-2.0, 2.0), 0.0, static_cast<double>(width_ - 1));
    child.position.y = std::clamp(agent.position.y + rng_.range(-2.0, 2.0), 0.0, static_cast<double>(height_ - 1));
    born.push_back(child);
  }
}

void Simulation::step(double dt, int substeps) {
  if (!std::isfinite(dt) || dt <= 0.0) {
    dt = 1.0 / 60.0;
  }
  dt = std::min(dt, 0.08);
  const int steps = std::clamp(substeps > 0 ? substeps : params_.substeps, 1, 12);
  const double subDt = dt / static_cast<double>(steps);

  for (int s = 0; s < steps; ++s) {
    fields_.rebuildFoodField(foods_, params_);
    std::vector<Agent> born;
    born.reserve(256);
    const std::size_t initialCount = agents_.size();
    for (std::size_t i = 0; i < initialCount; ++i) {
      stepAgent(agents_[i], subDt, born);
    }
    for (Agent& child : born) {
      if (static_cast<int>(agents_.size()) < params_.maxAgents) {
        agents_.push_back(child);
      }
    }
    fields_.diffuseAndDecay(subDt, params_);
    time_ += subDt;
    networkAccumulator_ += subDt;
  }

  if (agents_.size() > static_cast<std::size_t>(params_.maxAgents)) {
    agents_.erase(std::remove_if(agents_.begin(), agents_.end(), [](const Agent& a) { return !a.alive; }), agents_.end());
  }

  const int live = liveAgentCount();
  double pSum = 0.0;
  double searchSum = 0.0;
  for (const Agent& agent : agents_) {
    if (agent.alive) {
      pSum += agent.carriedNutrient;
      searchSum += agent.searchMode ? 1.0 : 0.0;
    }
  }
  avgSearchProbability_ = live > 0 ? pSum / static_cast<double>(live) : 0.0;
  searchRatio_ = live > 0 ? searchSum / static_cast<double>(live) : 0.0;

  if (params_.solverEnabled && networkAccumulator_ >= 0.12) {
    solver_.update(fields_, foods_, colonyCenter(), live, networkAccumulator_, params_);
    networkAccumulator_ = 0.0;
    networkCache_ = solver_.toJson();
  }
  updateRenderBuffers();
  updateStatsCache();
}

Vec2 Simulation::colonyCenter() const {
  Vec2 center{0.0, 0.0};
  int count = 0;
  for (const Agent& agent : agents_) {
    if (agent.alive) {
      center.x += agent.position.x;
      center.y += agent.position.y;
      ++count;
    }
  }
  if (count == 0) {
    return Vec2{width_ * 0.5, height_ * 0.5};
  }
  center.x /= count;
  center.y /= count;
  return center;
}

int Simulation::liveAgentCount() const {
  int count = 0;
  for (const Agent& agent : agents_) {
    if (agent.alive) {
      ++count;
    }
  }
  return count;
}

double Simulation::averageEnergy() const {
  double sum = 0.0;
  int count = 0;
  for (const Agent& agent : agents_) {
    if (agent.alive) {
      sum += agent.energy;
      ++count;
    }
  }
  return count > 0 ? sum / static_cast<double>(count) : 0.0;
}

double Simulation::totalFoodRemaining() const {
  double sum = 0.0;
  for (const FoodSource& food : foods_) {
    sum += std::max(0.0, food.calories);
  }
  return sum;
}

void Simulation::updateRenderBuffers() {
  fields_.writeRenderBuffer(renderBuffer_, params_);
  for (const FoodSource& food : foods_) {
    const double remaining = food.maxCalories > 0.0 ? std::clamp(food.calories / food.maxCalories, 0.0, 1.0) : 0.0;
    if (remaining <= 0.0 && params_.depletedFoodSignal <= 0.0) {
      continue;
    }
    const int minX = std::max(0, static_cast<int>(std::floor(food.position.x - food.radius)));
    const int maxX = std::min(width_ - 1, static_cast<int>(std::ceil(food.position.x + food.radius)));
    const int minY = std::max(0, static_cast<int>(std::floor(food.position.y - food.radius)));
    const int maxY = std::min(height_ - 1, static_cast<int>(std::ceil(food.position.y + food.radius)));
    const double r2 = food.radius * food.radius;
    for (int y = minY; y <= maxY; ++y) {
      for (int x = minX; x <= maxX; ++x) {
        const double dx = x - food.position.x;
        const double dy = y - food.position.y;
        if (dx * dx + dy * dy <= r2) {
          const int out = (y * width_ + x) * 4;
          const double a = 0.35 + 0.55 * remaining;
          renderBuffer_[out + 0] = static_cast<uint8_t>((1.0 - a) * renderBuffer_[out + 0] + a * 255.0);
          renderBuffer_[out + 1] = static_cast<uint8_t>((1.0 - a) * renderBuffer_[out + 1] + a * 178.0);
          renderBuffer_[out + 2] = static_cast<uint8_t>((1.0 - a) * renderBuffer_[out + 2] + a * 34.0);
        }
      }
    }
  }

  renderAgentCount_ = 0;
  for (const Agent& agent : agents_) {
    if (agent.alive) {
      ++renderAgentCount_;
    }
  }
  agentBuffer_.resize(static_cast<std::size_t>(renderAgentCount_) * 5U);
  int cursor = 0;
  for (const Agent& agent : agents_) {
    if (!agent.alive) {
      continue;
    }
    const double e = clamp01(agent.energy / std::max(1.0, params_.energyMax));
    agentBuffer_[cursor++] = static_cast<float>(agent.position.x);
    agentBuffer_[cursor++] = static_cast<float>(agent.position.y);
    agentBuffer_[cursor++] = static_cast<float>(agent.angle);
    agentBuffer_[cursor++] = static_cast<float>(e);
    agentBuffer_[cursor++] = agent.searchMode ? 1.0f : 0.0f;
  }
}

void Simulation::updateStatsCache() {
  const NetworkMetrics& m = solver_.metrics();
  std::ostringstream out;
  out << std::fixed << std::setprecision(4);
  out << "{\"time\":" << time_
      << ",\"liveAgents\":" << liveAgentCount()
      << ",\"totalAgents\":" << agents_.size()
      << ",\"averageEnergy\":" << averageEnergy()
      << ",\"foodRemaining\":" << totalFoodRemaining()
      << ",\"totalTrail\":" << fields_.totalTrail()
      << ",\"coverage\":" << fields_.coverage()
      << ",\"averageSearchProbability\":" << avgSearchProbability_
      << ",\"searchRatio\":" << searchRatio_
      << ",\"exploitRatio\":" << (1.0 - searchRatio_)
      << ",\"totalNetworkLength\":" << m.totalNetworkLength
      << ",\"transportCost\":" << m.transportCost
      << ",\"deliveredNutrients\":" << m.deliveredNutrients
      << ",\"efficiency\":" << m.efficiency
      << ",\"averageShortestPath\":" << m.averageShortestPath
      << ",\"networkNodes\":" << m.nodes
      << ",\"networkEdges\":" << m.edges
      << ",\"activeNetworkEdges\":" << m.activeEdges << "}";
  statsCache_ = out.str();
}

const char* Simulation::statsJson() {
  updateStatsCache();
  return statsCache_.c_str();
}

const char* Simulation::networkJson() {
  if (params_.solverEnabled && networkCache_.empty()) {
    networkCache_ = solver_.toJson();
  }
  return networkCache_.c_str();
}

const char* Simulation::exportStateJson() {
  std::ostringstream out;
  out << std::fixed << std::setprecision(4);
  out << "{\"width\":" << width_ << ",\"height\":" << height_ << ",\"time\":" << time_
      << ",\"seed\":" << seed_ << ",\"agents\":[";
  bool first = true;
  for (const Agent& agent : agents_) {
    if (!agent.alive) {
      continue;
    }
    if (!first) {
      out << ',';
    }
    first = false;
    out << "{\"id\":" << agent.id << ",\"x\":" << agent.position.x << ",\"y\":" << agent.position.y
        << ",\"angle\":" << agent.angle << ",\"energy\":" << agent.energy
        << ",\"search\":" << (agent.searchMode ? "true" : "false") << "}";
  }
  out << "],\"foods\":[";
  for (std::size_t i = 0; i < foods_.size(); ++i) {
    if (i > 0) {
      out << ',';
    }
    const FoodSource& food = foods_[i];
    out << "{\"id\":" << food.id << ",\"x\":" << food.position.x << ",\"y\":" << food.position.y
        << ",\"radius\":" << food.radius << ",\"calories\":" << food.calories
        << ",\"maxCalories\":" << food.maxCalories << ",\"attractorStrength\":" << food.attractorStrength
        << ",\"enabled\":" << (food.enabled ? "true" : "false") << "}";
  }
  out << "]}";
  stateCache_ = out.str();
  return stateCache_.c_str();
}

void Simulation::importStateJson(const char* jsonPtr) {
  if (!jsonPtr) {
    return;
  }
  const std::string json(jsonPtr);
  agents_.clear();
  foods_.clear();
  nextAgentId_ = 1;
  nextFoodId_ = 1;
  fields_.clear();
  readNumber(json, "time", time_);

  for (const std::string& object : objectsInArray(json, "agents")) {
    Agent agent;
    agent.id = static_cast<int>(objectNumber(object, "id", nextAgentId_++));
    nextAgentId_ = std::max(nextAgentId_, agent.id + 1);
    agent.position = Vec2{objectNumber(object, "x", width_ * 0.5), objectNumber(object, "y", height_ * 0.5)};
    agent.angle = objectNumber(object, "angle", 0.0);
    agent.energy = std::clamp(objectNumber(object, "energy", params_.initialEnergy), 0.0, params_.energyMax);
    agent.searchMode = objectBool(object, "search", true);
    agent.alive = true;
    agents_.push_back(agent);
  }

  for (const std::string& object : objectsInArray(json, "foods")) {
    FoodSource food;
    food.id = static_cast<int>(objectNumber(object, "id", nextFoodId_++));
    nextFoodId_ = std::max(nextFoodId_, food.id + 1);
    food.position = Vec2{objectNumber(object, "x", width_ * 0.5), objectNumber(object, "y", height_ * 0.5)};
    food.radius = objectNumber(object, "radius", params_.foodRadius);
    food.calories = objectNumber(object, "calories", params_.foodCalories);
    food.maxCalories = objectNumber(object, "maxCalories", std::max(1.0, food.calories));
    food.attractorStrength = objectNumber(object, "attractorStrength", params_.attractorStrength);
    food.enabled = objectBool(object, "enabled", food.calories > 0.0);
    foods_.push_back(food);
  }
  fields_.rebuildFoodField(foods_, params_);
  solver_.reset();
  updateRenderBuffers();
  updateStatsCache();
}

uint8_t* Simulation::renderBufferPtr() { return renderBuffer_.empty() ? nullptr : renderBuffer_.data(); }

float* Simulation::agentBufferPtr() { return agentBuffer_.empty() ? nullptr : agentBuffer_.data(); }

} // namespace physarum
