#include "physarum.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <queue>

namespace physarum {

namespace {
constexpr float kPi = 3.14159265358979323846f;
constexpr int kMaxAgents = 40000;
constexpr float kEps = 1.0e-5f;

float clampf(float value, float low, float high) {
  return std::max(low, std::min(high, value));
}

float dist2(float ax, float ay, float bx, float by) {
  const float dx = ax - bx;
  const float dy = ay - by;
  return dx * dx + dy * dy;
}
} // namespace

float sigmoid(float value) {
  if (value > 60.0f) return 1.0f;
  if (value < -60.0f) return 0.0f;
  return 1.0f / (1.0f + std::exp(-value));
}

float wrapAngle(float value) {
  while (value <= -kPi) value += 2.0f * kPi;
  while (value > kPi) value -= 2.0f * kPi;
  return value;
}

float angleDelta(float from, float to) {
  return wrapAngle(to - from);
}

Simulation::Simulation(int width, int height, std::uint32_t seed)
  : width_(std::max(16, width)),
    height_(std::max(16, height)),
    rng_(seed),
    trail_(static_cast<std::size_t>(width_) * height_, 0.0f),
    trailScratch_(static_cast<std::size_t>(width_) * height_, 0.0f),
    foodField_(static_cast<std::size_t>(width_) * height_, 0.0f) {
  seedDefaultWorld();
  updateFoodField();
  updateMetrics();
}

void Simulation::reset(std::uint32_t seed) {
  rng_ = seed == 0 ? 1u : seed;
  stepIndex_ = 0;
  agents_.clear();
  foods_.clear();
  std::fill(trail_.begin(), trail_.end(), 0.0f);
  std::fill(trailScratch_.begin(), trailScratch_.end(), 0.0f);
  std::fill(foodField_.begin(), foodField_.end(), 0.0f);
  nodes_.clear();
  edges_.clear();
  networkFloats_.clear();
  seedDefaultWorld();
  updateFoodField();
  updateMetrics();
}

void Simulation::seedDefaultWorld() {
  addFood(width_ * 0.28f, height_ * 0.34f, params_.defaultFoodCalories, params_.defaultFoodRadius, 1.2f);
  addFood(width_ * 0.75f, height_ * 0.63f, params_.defaultFoodCalories * 0.82f, params_.defaultFoodRadius, 0.95f);
  addAgents(width_ * 0.48f, height_ * 0.48f, 950, std::min(width_, height_) * 0.09f, params_.maxEnergy * 0.82f);
}

float Simulation::rand01() {
  rng_ ^= rng_ << 13;
  rng_ ^= rng_ >> 17;
  rng_ ^= rng_ << 5;
  return static_cast<float>(rng_) / static_cast<float>(std::numeric_limits<std::uint32_t>::max());
}

float Simulation::randSigned() {
  return rand01() * 2.0f - 1.0f;
}

int Simulation::index(int x, int y) const {
  x = std::max(0, std::min(width_ - 1, x));
  y = std::max(0, std::min(height_ - 1, y));
  return y * width_ + x;
}

void Simulation::setParam(int id, double value) {
  const float v = static_cast<float>(value);
  switch (id) {
    case ParamSpeed: params_.speed = v; break;
    case ParamSensorDistance: params_.sensorDistance = v; break;
    case ParamSensorAngle: params_.sensorAngle = v; break;
    case ParamTurnAngle: params_.turnAngle = v; break;
    case ParamTrailDeposit: params_.trailDeposit = v; break;
    case ParamTrailDecay: params_.trailDecay = v; break;
    case ParamTrailDiffuse: params_.trailDiffuse = v; break;
    case ParamFoodCalories: params_.defaultFoodCalories = v; break;
    case ParamFoodRadius: params_.defaultFoodRadius = v; break;
    case ParamFoodQuality: params_.defaultFoodQuality = v; break;
    case ParamMaxEnergy: params_.maxEnergy = std::max(1.0f, v); break;
    case ParamBaseMetabolism: params_.baseMetabolism = v; break;
    case ParamMoveCost: params_.moveCost = v; break;
    case ParamSearchCost: params_.searchCost = v; break;
    case ParamEatRate: params_.eatRate = v; break;
    case ParamEatEfficiency: params_.eatEfficiency = v; break;
    case ParamGrowthThreshold: params_.growthThreshold = v; break;
    case ParamGrowthRate: params_.growthRate = v; break;
    case ParamGrowthCost: params_.growthCost = v; break;
    case ParamSplitMass: params_.splitMass = v; break;
    case ParamSplitEnergy: params_.splitEnergy = v; break;
    case ParamStarvationSteps: params_.starvationSteps = v; break;
    case ParamNetworkInterval: params_.networkInterval = std::max(1.0f, v); break;
    case ParamBrushRadius: params_.brushRadius = v; break;
    default: break;
  }
}

void Simulation::addAgents(float x, float y, int count, float radius, float energy) {
  count = std::max(0, count);
  radius = std::max(0.0f, radius);
  for (int i = 0; i < count && static_cast<int>(agents_.size()) < kMaxAgents; ++i) {
    const float r = std::sqrt(rand01()) * radius;
    const float a = rand01() * 2.0f * kPi;
    Agent agent;
    agent.x = clampf(x + std::cos(a) * r, 0.0f, static_cast<float>(width_ - 1));
    agent.y = clampf(y + std::sin(a) * r, 0.0f, static_cast<float>(height_ - 1));
    agent.theta = rand01() * 2.0f * kPi - kPi;
    agent.energy = clampf(energy, 0.0f, params_.maxEnergy);
    agent.mass = 0.85f + rand01() * 0.35f;
    agent.mode = Search;
    agent.alive = true;
    agents_.push_back(agent);
  }
}

void Simulation::addFood(float x, float y, float calories, float radius, float quality) {
  Food food;
  food.x = clampf(x, 0.0f, static_cast<float>(width_ - 1));
  food.y = clampf(y, 0.0f, static_cast<float>(height_ - 1));
  food.calories = std::max(0.0f, calories);
  food.quality = std::max(0.05f, quality);
  food.radius = std::max(2.0f, radius);
  food.sigma = std::max(6.0f, radius * 2.0f);
  foods_.push_back(food);
}

void Simulation::erase(float x, float y, float radius) {
  const float r2 = radius * radius;
  agents_.erase(std::remove_if(agents_.begin(), agents_.end(), [&](const Agent& agent) {
    return dist2(agent.x, agent.y, x, y) <= r2;
  }), agents_.end());
  foods_.erase(std::remove_if(foods_.begin(), foods_.end(), [&](const Food& food) {
    return dist2(food.x, food.y, x, y) <= r2;
  }), foods_.end());
  const int minX = std::max(0, static_cast<int>(std::floor(x - radius)));
  const int maxX = std::min(width_ - 1, static_cast<int>(std::ceil(x + radius)));
  const int minY = std::max(0, static_cast<int>(std::floor(y - radius)));
  const int maxY = std::min(height_ - 1, static_cast<int>(std::ceil(y + radius)));
  for (int yy = minY; yy <= maxY; ++yy) {
    for (int xx = minX; xx <= maxX; ++xx) {
      if (dist2(static_cast<float>(xx), static_cast<float>(yy), x, y) <= r2) {
        trail_[index(xx, yy)] = 0.0f;
      }
    }
  }
  updateFoodField();
}

float Simulation::sampleField(float x, float y) const {
  x = clampf(x, 0.0f, static_cast<float>(width_ - 1));
  y = clampf(y, 0.0f, static_cast<float>(height_ - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(width_ - 1, x0 + 1);
  const int y1 = std::min(height_ - 1, y0 + 1);
  const float tx = x - x0;
  const float ty = y - y0;
  const float a = trail_[index(x0, y0)] + foodField_[index(x0, y0)];
  const float b = trail_[index(x1, y0)] + foodField_[index(x1, y0)];
  const float c = trail_[index(x0, y1)] + foodField_[index(x0, y1)];
  const float d = trail_[index(x1, y1)] + foodField_[index(x1, y1)];
  return (1.0f - tx) * (1.0f - ty) * a + tx * (1.0f - ty) * b + (1.0f - tx) * ty * c + tx * ty * d;
}

float Simulation::combinedSignal(float x, float y) const {
  return sampleField(x, y);
}

float Simulation::searchProbability(float energy, float signal) const {
  const float e = clampf(energy / std::max(1.0f, params_.maxEnergy), 0.0f, 1.0f);
  const float enoughEnergy = sigmoid(9.0f * (e - 0.24f));
  const float weakSignal = 1.0f - sigmoid(2.8f * (signal - 0.42f));
  return clampf(enoughEnergy * weakSignal, 0.0f, 1.0f);
}

void Simulation::depositTrail(const Agent& agent) {
  const int x0 = static_cast<int>(std::floor(agent.x));
  const int y0 = static_cast<int>(std::floor(agent.y));
  const float tx = agent.x - x0;
  const float ty = agent.y - y0;
  const float energyFactor = clampf(agent.energy / params_.maxEnergy, 0.0f, 1.0f);
  const float modeFactor = agent.mode == Exploit ? 1.25f : (agent.mode == Dormant ? 0.15f : 1.0f);
  const float amount = params_.trailDeposit * agent.mass * energyFactor * modeFactor;
  const auto splat = [&](int x, int y, float w) {
    if (x >= 0 && y >= 0 && x < width_ && y < height_) {
      trail_[index(x, y)] += amount * w;
    }
  };
  splat(x0, y0, (1.0f - tx) * (1.0f - ty));
  splat(x0 + 1, y0, tx * (1.0f - ty));
  splat(x0, y0 + 1, (1.0f - tx) * ty);
  splat(x0 + 1, y0 + 1, tx * ty);
}

void Simulation::clampOrBounce(Agent& agent) {
  if (agent.x < 0.0f) {
    agent.x = 0.0f;
    agent.theta = wrapAngle(kPi - agent.theta);
  } else if (agent.x > width_ - 1) {
    agent.x = static_cast<float>(width_ - 1);
    agent.theta = wrapAngle(kPi - agent.theta);
  }
  if (agent.y < 0.0f) {
    agent.y = 0.0f;
    agent.theta = wrapAngle(-agent.theta);
  } else if (agent.y > height_ - 1) {
    agent.y = static_cast<float>(height_ - 1);
    agent.theta = wrapAngle(-agent.theta);
  }
}

void Simulation::updateAgents() {
  const std::size_t initialCount = agents_.size();
  for (std::size_t i = 0; i < initialCount; ++i) {
    Agent& agent = agents_[i];
    if (!agent.alive) continue;

    const float ux = std::cos(agent.theta);
    const float uy = std::sin(agent.theta);
    const float front = combinedSignal(agent.x + ux * params_.sensorDistance, agent.y + uy * params_.sensorDistance);
    const float lt = agent.theta + params_.sensorAngle;
    const float rt = agent.theta - params_.sensorAngle;
    const float left = combinedSignal(agent.x + std::cos(lt) * params_.sensorDistance, agent.y + std::sin(lt) * params_.sensorDistance);
    const float right = combinedSignal(agent.x + std::cos(rt) * params_.sensorDistance, agent.y + std::sin(rt) * params_.sensorDistance);
    const float maxSignal = std::max(front, std::max(left, right));

    const float pSearch = searchProbability(agent.energy, maxSignal);
    if (agent.energy < params_.maxEnergy * 0.11f && maxSignal < 0.25f) {
      agent.mode = Dormant;
    } else {
      agent.mode = rand01() < pSearch ? Search : Exploit;
    }

    float turn = 0.0f;
    if (left > front && left >= right) turn = params_.turnAngle;
    if (right > front && right > left) turn = -params_.turnAngle;
    const float noise = (agent.mode == Search || maxSignal < 0.18f) ? randSigned() * params_.turnAngle * 0.85f : 0.0f;
    agent.theta = wrapAngle(agent.theta + turn + noise);

    float fx = 0.0f;
    float fy = 0.0f;
    for (const Food& food : foods_) {
      if (food.calories <= 0.0f) continue;
      const float dx = food.x - agent.x;
      const float dy = food.y - agent.y;
      const float d2 = dx * dx + dy * dy + 18.0f;
      const float inv = 1.0f / std::sqrt(d2);
      const float pull = food.quality * food.calories / (food.calories + 220.0f) / d2;
      fx += dx * inv * pull;
      fy += dy * inv * pull;
    }
    const float foodForce = std::sqrt(fx * fx + fy * fy);
    if (foodForce > kEps) {
      const float hunger = std::pow(1.0f - clampf(agent.energy / params_.maxEnergy, 0.0f, 1.0f), 1.35f);
      const float rho = clampf(foodForce * 140.0f * hunger, 0.0f, 0.74f);
      const float foodAngle = std::atan2(fy, fx);
      agent.theta = wrapAngle(agent.theta + angleDelta(agent.theta, foodAngle) * rho);
    }

    const float energyFactor = clampf(0.18f + 0.82f * agent.energy / params_.maxEnergy, 0.12f, 1.0f);
    const float modeFactor = agent.mode == Dormant ? 0.18f : 1.0f;
    const float speed = params_.speed * energyFactor * modeFactor;
    agent.x += std::cos(agent.theta) * speed;
    agent.y += std::sin(agent.theta) * speed;
    clampOrBounce(agent);

    const float loss = params_.baseMetabolism * agent.mass
      + params_.moveCost * speed * speed * agent.mass
      + (agent.mode == Search ? params_.searchCost : 0.0f);
    agent.energy = std::max(0.0f, agent.energy - loss);

    for (Food& food : foods_) {
      if (food.calories <= 0.0f) continue;
      const float reach = std::max(food.radius, 2.0f);
      if (dist2(agent.x, agent.y, food.x, food.y) <= reach * reach) {
        const float gain = std::min(food.calories, params_.eatRate * food.quality * 0.08f);
        food.calories -= gain;
        agent.energy = clampf(agent.energy + gain * params_.eatEfficiency, 0.0f, params_.maxEnergy);
        agent.mode = Exploit;
      }
    }

    if (agent.energy / params_.maxEnergy > params_.growthThreshold) {
      const float dm = params_.growthRate * (agent.energy / params_.maxEnergy - params_.growthThreshold) * agent.mass;
      agent.mass += dm;
      agent.energy = std::max(0.0f, agent.energy - params_.growthCost * dm);
    }

    if (agent.mass > params_.splitMass && agent.energy > params_.splitEnergy && agents_.size() < kMaxAgents) {
      Agent child = agent;
      child.theta = wrapAngle(agent.theta + randSigned() * 1.4f);
      child.x = clampf(agent.x + randSigned() * 3.0f, 0.0f, static_cast<float>(width_ - 1));
      child.y = clampf(agent.y + randSigned() * 3.0f, 0.0f, static_cast<float>(height_ - 1));
      child.mass = agent.mass * 0.46f;
      child.energy = agent.energy * 0.46f;
      agent.mass *= 0.54f;
      agent.energy *= 0.54f;
      agents_.push_back(child);
    }

    if (agent.energy <= 0.001f) {
      agent.starvation += 1;
    } else {
      agent.starvation = 0;
    }
    if (agent.starvation > static_cast<int>(params_.starvationSteps)) {
      agent.alive = false;
    }
    depositTrail(agent);
  }

  foods_.erase(std::remove_if(foods_.begin(), foods_.end(), [](const Food& food) {
    return food.calories <= 0.01f;
  }), foods_.end());
}

void Simulation::updateFoodField() {
  std::fill(foodField_.begin(), foodField_.end(), 0.0f);
  for (const Food& food : foods_) {
    if (food.calories <= 0.0f) continue;
    const float sigma = std::max(3.0f, food.sigma);
    const int reach = static_cast<int>(std::ceil(sigma * 3.0f));
    const int minX = std::max(0, static_cast<int>(food.x) - reach);
    const int maxX = std::min(width_ - 1, static_cast<int>(food.x) + reach);
    const int minY = std::max(0, static_cast<int>(food.y) - reach);
    const int maxY = std::min(height_ - 1, static_cast<int>(food.y) + reach);
    const float amp = food.quality * food.calories / (food.calories + 260.0f);
    const float denom = 2.0f * sigma * sigma;
    for (int y = minY; y <= maxY; ++y) {
      for (int x = minX; x <= maxX; ++x) {
        const float d = dist2(static_cast<float>(x), static_cast<float>(y), food.x, food.y);
        foodField_[index(x, y)] += amp * std::exp(-d / denom);
      }
    }
  }
}

void Simulation::diffuseTrail() {
  const float mix = clampf(params_.trailDiffuse, 0.0f, 1.0f);
  const float decay = clampf(1.0f - params_.trailDecay, 0.0f, 1.0f);
  for (int y = 0; y < height_; ++y) {
    for (int x = 0; x < width_; ++x) {
      float sum = 0.0f;
      int n = 0;
      for (int dy = -1; dy <= 1; ++dy) {
        for (int dx = -1; dx <= 1; ++dx) {
          const int xx = x + dx;
          const int yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < width_ && yy < height_) {
            sum += trail_[index(xx, yy)];
            n += 1;
          }
        }
      }
      const float blurred = sum / static_cast<float>(n);
      const float current = trail_[index(x, y)];
      trailScratch_[index(x, y)] = (current * (1.0f - mix) + blurred * mix) * decay;
    }
  }
  trail_.swap(trailScratch_);
}

void Simulation::step(int steps) {
  steps = std::max(1, steps);
  for (int i = 0; i < steps; ++i) {
    updateFoodField();
    updateAgents();
    diffuseTrail();
    stepIndex_ += 1;
    if (stepIndex_ % static_cast<int>(params_.networkInterval) == 0) {
      updateNetwork();
    }
  }
  updateMetrics();
}

void Simulation::updateNetwork() {
  nodes_.clear();
  edges_.clear();
  networkFloats_.clear();

  for (const Food& food : foods_) {
    if (food.calories > 0.01f) {
      nodes_.push_back(Node{food.x, food.y, 1});
    }
  }
  const int stride = std::max(8, std::min(width_, height_) / 8);
  for (int y = stride / 2; y < height_; y += stride) {
    for (int x = stride / 2; x < width_; x += stride) {
      const float t = trail_[index(x, y)];
      if (t > 0.18f && static_cast<int>(nodes_.size()) < 90) {
        nodes_.push_back(Node{static_cast<float>(x), static_cast<float>(y), 0});
      }
    }
  }
  if (nodes_.size() < 2) return;

  const float radius = std::max(width_, height_) * 0.22f;
  for (int i = 0; i < static_cast<int>(nodes_.size()); ++i) {
    for (int j = i + 1; j < static_cast<int>(nodes_.size()); ++j) {
      const float length = std::sqrt(dist2(nodes_[i].x, nodes_[i].y, nodes_[j].x, nodes_[j].y));
      if (length <= radius || nodes_[i].kind + nodes_[j].kind >= 2) {
        Edge edge;
        edge.a = i;
        edge.b = j;
        edge.length = std::max(1.0f, length);
        edge.conductance = 0.18f;
        edges_.push_back(edge);
      }
    }
  }
  if (edges_.empty()) return;

  const int source = 0;
  int target = 1;
  for (int i = 1; i < static_cast<int>(nodes_.size()); ++i) {
    if (nodes_[i].kind == 1) {
      target = i;
      break;
    }
  }

  std::vector<std::vector<std::pair<int, int>>> adj(nodes_.size());
  for (int e = 0; e < static_cast<int>(edges_.size()); ++e) {
    adj[edges_[e].a].push_back({edges_[e].b, e});
    adj[edges_[e].b].push_back({edges_[e].a, e});
  }
  std::vector<float> dist(nodes_.size(), std::numeric_limits<float>::infinity());
  std::vector<int> prevNode(nodes_.size(), -1);
  std::vector<int> prevEdge(nodes_.size(), -1);
  using Item = std::pair<float, int>;
  std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
  dist[source] = 0.0f;
  pq.push({0.0f, source});
  while (!pq.empty()) {
    auto [d, u] = pq.top();
    pq.pop();
    if (d > dist[u]) continue;
    for (auto [v, e] : adj[u]) {
      const float cost = edges_[e].length / std::pow(edges_[e].conductance + 0.03f, 0.8f);
      if (dist[u] + cost < dist[v]) {
        dist[v] = dist[u] + cost;
        prevNode[v] = u;
        prevEdge[v] = e;
        pq.push({dist[v], v});
      }
    }
  }

  for (Edge& edge : edges_) {
    edge.path = false;
    edge.flow = 0.0f;
    edge.conductance = std::max(0.035f, edge.conductance * 0.965f);
  }
  float pathLength = 0.0f;
  int cursor = target;
  while (cursor != source && cursor >= 0 && prevEdge[cursor] >= 0) {
    Edge& edge = edges_[prevEdge[cursor]];
    edge.path = true;
    edge.flow = 1.0f;
    edge.conductance = std::min(4.0f, edge.conductance + 0.22f);
    pathLength += edge.length;
    cursor = prevNode[cursor];
  }

  float cost = 0.0f;
  float diss = 0.0f;
  for (const Edge& edge : edges_) {
    cost += edge.length * edge.conductance;
    diss += edge.flow * edge.flow * edge.length / (edge.conductance + kEps);
    networkFloats_.push_back(nodes_[edge.a].x);
    networkFloats_.push_back(nodes_[edge.a].y);
    networkFloats_.push_back(nodes_[edge.b].x);
    networkFloats_.push_back(nodes_[edge.b].y);
    networkFloats_.push_back(edge.conductance);
    networkFloats_.push_back(edge.flow);
    networkFloats_.push_back(edge.path ? 1.0f : 0.0f);
  }
  metrics_.pathLength = pathLength;
  metrics_.transportCost = cost;
  metrics_.dissipation = diss;
}

void Simulation::updateMetrics() {
  Metrics metrics;
  metrics.agents = static_cast<float>(agents_.size());
  metrics.foods = static_cast<float>(foods_.size());
  for (const Agent& agent : agents_) {
    if (!agent.alive) continue;
    metrics.alive += 1.0f;
    metrics.totalBiomass += agent.mass;
    metrics.avgEnergy += agent.energy;
    if (agent.mode == Search) metrics.searchCount += 1.0f;
    if (agent.mode == Exploit) metrics.exploitCount += 1.0f;
    if (agent.mode == Dormant) metrics.dormantCount += 1.0f;
  }
  if (metrics.alive > 0.0f) metrics.avgEnergy /= metrics.alive;
  for (const Food& food : foods_) metrics.foodRemaining += food.calories;
  metrics.pathLength = metrics_.pathLength;
  metrics.transportCost = metrics_.transportCost;
  metrics.dissipation = metrics_.dissipation;
  metrics.backendCode = 1.0f;
  metrics_ = metrics;
  rebuildAgentFloats();
  rebuildFoodFloats();
  rebuildMetricFloats();
}

void Simulation::rebuildAgentFloats() {
  agentFloats_.clear();
  agentFloats_.reserve(agents_.size() * 7);
  for (const Agent& agent : agents_) {
    agentFloats_.push_back(agent.x);
    agentFloats_.push_back(agent.y);
    agentFloats_.push_back(agent.theta);
    agentFloats_.push_back(agent.energy);
    agentFloats_.push_back(agent.mass);
    agentFloats_.push_back(static_cast<float>(agent.mode));
    agentFloats_.push_back(agent.alive ? 1.0f : 0.0f);
  }
}

void Simulation::rebuildFoodFloats() {
  foodFloats_.clear();
  foodFloats_.reserve(foods_.size() * 5);
  for (const Food& food : foods_) {
    foodFloats_.push_back(food.x);
    foodFloats_.push_back(food.y);
    foodFloats_.push_back(food.calories);
    foodFloats_.push_back(food.radius);
    foodFloats_.push_back(food.quality);
  }
}

void Simulation::rebuildMetricFloats() {
  metricFloats_ = {
    metrics_.alive,
    metrics_.agents,
    metrics_.foods,
    metrics_.totalBiomass,
    metrics_.avgEnergy,
    metrics_.foodRemaining,
    metrics_.searchCount,
    metrics_.exploitCount,
    metrics_.dormantCount,
    metrics_.pathLength,
    metrics_.transportCost,
    metrics_.dissipation,
    metrics_.backendCode
  };
}

float* Simulation::agentPtr() {
  rebuildAgentFloats();
  return agentFloats_.data();
}

float* Simulation::foodPtr() {
  rebuildFoodFloats();
  return foodFloats_.data();
}

float* Simulation::metricsPtr() {
  rebuildMetricFloats();
  return metricFloats_.data();
}

float* Simulation::networkPtr() {
  return networkFloats_.data();
}

} // namespace physarum
