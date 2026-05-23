#include "NetworkGraph.hpp"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iomanip>
#include <limits>
#include <queue>
#include <sstream>
#include <unordered_map>

namespace physarum {

namespace {

double dist(Vec2 a, Vec2 b) {
  const double dx = a.x - b.x;
  const double dy = a.y - b.y;
  return std::sqrt(dx * dx + dy * dy);
}

int gridKey(int gx, int gy, int cols) { return gy * cols + gx; }

} // namespace

void NetworkGraph::clear() {
  nodes_.clear();
  edges_.clear();
  metrics_ = {};
}

int NetworkGraph::addNode(Vec2 p, bool isFood, bool isSink) {
  NetworkNode node;
  node.id = static_cast<int>(nodes_.size());
  node.position = p;
  node.isFood = isFood;
  node.isSink = isSink;
  nodes_.push_back(node);
  return node.id;
}

void NetworkGraph::addEdge(int a, int b, double length, double conductivity) {
  if (a < 0 || b < 0 || a == b) {
    return;
  }
  for (const NetworkEdge& edge : edges_) {
    if ((edge.a == a && edge.b == b) || (edge.a == b && edge.b == a)) {
      return;
    }
  }
  NetworkEdge edge;
  edge.a = a;
  edge.b = b;
  edge.length = std::max(1e-3, length);
  edge.conductivity = conductivity;
  edges_.push_back(edge);
}

int NetworkGraph::nearestNode(Vec2 p) const {
  if (nodes_.empty()) {
    return -1;
  }
  int best = 0;
  double bestD = std::numeric_limits<double>::max();
  for (const NetworkNode& node : nodes_) {
    const double d = dist(p, node.position);
    if (d < bestD) {
      bestD = d;
      best = node.id;
    }
  }
  return best;
}

std::vector<int> NetworkGraph::neighborsFor(int nodeId) const {
  std::vector<int> out;
  for (std::size_t i = 0; i < edges_.size(); ++i) {
    if (edges_[i].a == nodeId || edges_[i].b == nodeId) {
      out.push_back(static_cast<int>(i));
    }
  }
  return out;
}

void NetworkGraph::buildFromFields(const FieldGrid& fields,
                                   const std::vector<FoodSource>& foods,
                                   Vec2 colonyCenter,
                                   int liveAgents,
                                   const Params& params) {
  clear();
  const int stride = std::max(2, params.graphStride);
  const int cols = (fields.width() + stride - 1) / stride;
  const int rows = (fields.height() + stride - 1) / stride;
  std::unordered_map<int, int> cellToNode;

  for (int gy = 0; gy < rows; ++gy) {
    for (int gx = 0; gx < cols; ++gx) {
      const int x = std::min(fields.width() - 1, gx * stride);
      const int y = std::min(fields.height() - 1, gy * stride);
      if (fields.wallAtCell(x, y) > 0.2f) {
        continue;
      }
      if (fields.trailAtCell(x, y) >= params.trailThreshold) {
        const int id = addNode(Vec2{static_cast<double>(x), static_cast<double>(y)}, false, false);
        cellToNode[gridKey(gx, gy, cols)] = id;
      }
    }
  }

  for (int gy = 0; gy < rows; ++gy) {
    for (int gx = 0; gx < cols; ++gx) {
      const auto it = cellToNode.find(gridKey(gx, gy, cols));
      if (it == cellToNode.end()) {
        continue;
      }
      const int a = it->second;
      const int x = std::min(fields.width() - 1, gx * stride);
      const int y = std::min(fields.height() - 1, gy * stride);
      const double tA = fields.trailAtCell(x, y);
      const int neighborKeys[2] = {gridKey(gx + 1, gy, cols), gridKey(gx, gy + 1, cols)};
      for (int key : neighborKeys) {
        const auto jt = cellToNode.find(key);
        if (jt == cellToNode.end()) {
          continue;
        }
        const int b = jt->second;
        const double t = std::clamp(tA / std::max(1.0, params.trailMax), 0.0, 1.0);
        const double d0 = params.conductivityMin + t * (params.conductivityMax * 0.20);
        addEdge(a, b, dist(nodes_[a].position, nodes_[b].position), d0);
      }
    }
  }

  double totalSource = 0.0;
  for (const FoodSource& food : foods) {
    if (!food.enabled || food.calories <= 0.0 || food.maxCalories <= 0.0) {
      continue;
    }
    const double remaining = std::clamp(food.calories / food.maxCalories, 0.0, 1.0);
    const double supply = std::max(0.03, remaining * food.attractorStrength / 20.0);
    const int near = nearestNode(food.position);
    int id = near;
    if (near < 0 || dist(food.position, nodes_[near].position) > stride * 1.4) {
      id = addNode(food.position, true, false);
      if (near >= 0) {
        addEdge(id, near, dist(food.position, nodes_[near].position),
                params.conductivityMin + 0.12 * params.conductivityMax);
      }
    }
    nodes_[id].isFood = true;
    nodes_[id].supply += supply;
    totalSource += supply;
  }

  if (liveAgents > 0) {
    const int near = nearestNode(colonyCenter);
    int sinkId = near;
    if (near < 0 || dist(colonyCenter, nodes_[near].position) > stride * 1.4) {
      sinkId = addNode(colonyCenter, false, true);
      if (near >= 0) {
        addEdge(sinkId, near, dist(colonyCenter, nodes_[near].position),
                params.conductivityMin + 0.10 * params.conductivityMax);
      }
    }
    nodes_[sinkId].isSink = true;
    nodes_[sinkId].supply -= totalSource;
  }

  if (edges_.empty() && nodes_.size() >= 2) {
    for (std::size_t i = 1; i < nodes_.size(); ++i) {
      addEdge(static_cast<int>(i - 1), static_cast<int>(i), dist(nodes_[i - 1].position, nodes_[i].position),
              params.conductivityMin + 0.1);
    }
  }

  metrics_.nodes = static_cast<int>(nodes_.size());
  metrics_.edges = static_cast<int>(edges_.size());
}

void NetworkGraph::solvePressure(const Params& params) {
  if (nodes_.size() < 2 || edges_.empty()) {
    return;
  }

  std::vector<std::vector<std::pair<int, int>>> adjacency(nodes_.size());
  for (std::size_t e = 0; e < edges_.size(); ++e) {
    adjacency[edges_[e].a].push_back({edges_[e].b, static_cast<int>(e)});
    adjacency[edges_[e].b].push_back({edges_[e].a, static_cast<int>(e)});
  }

  int fixed = 0;
  for (const NetworkNode& node : nodes_) {
    if (node.isSink) {
      fixed = node.id;
      break;
    }
  }
  nodes_[fixed].pressure = 0.0;

  for (int iter = 0; iter < std::max(1, params.pressureIterations); ++iter) {
    double maxDelta = 0.0;
    for (std::size_t i = 0; i < nodes_.size(); ++i) {
      if (static_cast<int>(i) == fixed || adjacency[i].empty()) {
        continue;
      }
      double diag = 0.0;
      double weightedNeighbors = 0.0;
      for (auto [neighbor, edgeIndex] : adjacency[i]) {
        const NetworkEdge& edge = edges_[edgeIndex];
        const double c = edge.conductivity / (edge.length + 1e-6);
        diag += c;
        weightedNeighbors += c * nodes_[neighbor].pressure;
      }
      if (diag <= 1e-12) {
        continue;
      }
      // From sum_j D_ij / L_ij (P_i - P_j) = b_i.
      const double nextP = (nodes_[i].supply + weightedNeighbors) / diag;
      maxDelta = std::max(maxDelta, std::abs(nextP - nodes_[i].pressure));
      nodes_[i].pressure = nextP;
    }
    if (maxDelta < params.pressureTolerance) {
      break;
    }
  }

  for (NetworkEdge& edge : edges_) {
    edge.flow = edge.conductivity / (edge.length + 1e-6) *
                (nodes_[edge.a].pressure - nodes_[edge.b].pressure);
  }
}

void NetworkGraph::updateConductivity(double dt, const Params& params) {
  for (NetworkEdge& edge : edges_) {
    // dD/dt = alpha |Q|^mu - lambda D.
    const double growth = params.conductivityAlpha * std::pow(std::abs(edge.flow), params.conductivityMu);
    const double decay = params.conductivityDecay * edge.conductivity;
    edge.conductivity = std::clamp(edge.conductivity + dt * (growth - decay),
                                   params.conductivityMin,
                                   params.conductivityMax);
  }
}

void NetworkGraph::computeShortestPaths(const Params& params) {
  for (NetworkEdge& edge : edges_) {
    edge.shortest = false;
  }
  metrics_.averageShortestPath = 0.0;
  if (nodes_.empty() || edges_.empty()) {
    return;
  }

  std::vector<std::vector<std::pair<int, int>>> adjacency(nodes_.size());
  for (std::size_t e = 0; e < edges_.size(); ++e) {
    adjacency[edges_[e].a].push_back({edges_[e].b, static_cast<int>(e)});
    adjacency[edges_[e].b].push_back({edges_[e].a, static_cast<int>(e)});
  }

  std::vector<int> foods;
  std::vector<int> sinks;
  for (const NetworkNode& node : nodes_) {
    if (node.isFood) {
      foods.push_back(node.id);
    }
    if (node.isSink) {
      sinks.push_back(node.id);
    }
  }
  if (foods.empty() || sinks.empty()) {
    return;
  }

  int foundPaths = 0;
  for (int source : foods) {
    const double inf = std::numeric_limits<double>::infinity();
    std::vector<double> d(nodes_.size(), inf);
    std::vector<int> parentNode(nodes_.size(), -1);
    std::vector<int> parentEdge(nodes_.size(), -1);
    using Item = std::pair<double, int>;
    std::priority_queue<Item, std::vector<Item>, std::greater<Item>> pq;
    d[source] = 0.0;
    pq.push({0.0, source});
    while (!pq.empty()) {
      const auto [cost, node] = pq.top();
      pq.pop();
      if (cost > d[node]) {
        continue;
      }
      for (auto [neighbor, edgeIndex] : adjacency[node]) {
        const NetworkEdge& edge = edges_[edgeIndex];
        const double weight = edge.length / (edge.conductivity + 1e-6) +
                              params.lambdaEnergy * edge.length;
        if (d[node] + weight < d[neighbor]) {
          d[neighbor] = d[node] + weight;
          parentNode[neighbor] = node;
          parentEdge[neighbor] = edgeIndex;
          pq.push({d[neighbor], neighbor});
        }
      }
    }

    int bestSink = -1;
    double bestCost = inf;
    for (int sink : sinks) {
      if (d[sink] < bestCost) {
        bestCost = d[sink];
        bestSink = sink;
      }
    }
    if (bestSink < 0 || !std::isfinite(bestCost)) {
      continue;
    }
    ++foundPaths;
    metrics_.averageShortestPath += bestCost;
    int current = bestSink;
    while (current != source && parentEdge[current] >= 0) {
      edges_[parentEdge[current]].shortest = true;
      current = parentNode[current];
    }
  }
  if (foundPaths > 0) {
    metrics_.averageShortestPath /= static_cast<double>(foundPaths);
  }
}

void NetworkGraph::computeMetrics(const Params& params) {
  metrics_.nodes = static_cast<int>(nodes_.size());
  metrics_.edges = static_cast<int>(edges_.size());
  metrics_.activeEdges = 0;
  metrics_.totalNetworkLength = 0.0;
  metrics_.transportCost = 0.0;
  metrics_.deliveredNutrients = 0.0;

  for (const NetworkEdge& edge : edges_) {
    const bool active = edge.conductivity > params.conductivityMin * 1.15 || edge.shortest;
    if (active) {
      ++metrics_.activeEdges;
      metrics_.totalNetworkLength += edge.length;
      metrics_.transportCost += edge.flow * edge.flow * edge.length / (edge.conductivity + 1e-6);
    }
  }

  for (const NetworkNode& node : nodes_) {
    if (!node.isSink) {
      continue;
    }
    double inflow = 0.0;
    for (const NetworkEdge& edge : edges_) {
      if (edge.b == node.id && edge.flow > 0.0) {
        inflow += edge.flow;
      } else if (edge.a == node.id && edge.flow < 0.0) {
        inflow += -edge.flow;
      }
    }
    metrics_.deliveredNutrients += std::max(0.0, inflow);
  }
  metrics_.efficiency = metrics_.deliveredNutrients / (metrics_.transportCost + 1e-6);
}

std::string NetworkGraph::toJson() const {
  std::ostringstream out;
  out << std::fixed << std::setprecision(4);
  out << "{\"nodes\":[";
  for (std::size_t i = 0; i < nodes_.size(); ++i) {
    const NetworkNode& n = nodes_[i];
    if (i > 0) {
      out << ',';
    }
    out << "{\"id\":" << n.id << ",\"x\":" << n.position.x << ",\"y\":" << n.position.y
        << ",\"pressure\":" << n.pressure << ",\"food\":" << (n.isFood ? "true" : "false")
        << ",\"sink\":" << (n.isSink ? "true" : "false") << '}';
  }
  out << "],\"edges\":[";
  for (std::size_t i = 0; i < edges_.size(); ++i) {
    const NetworkEdge& e = edges_[i];
    if (i > 0) {
      out << ',';
    }
    out << "{\"a\":" << e.a << ",\"b\":" << e.b << ",\"length\":" << e.length
        << ",\"conductivity\":" << e.conductivity << ",\"flow\":" << e.flow
        << ",\"shortest\":" << (e.shortest ? "true" : "false") << '}';
  }
  out << "],\"metrics\":{\"totalNetworkLength\":" << metrics_.totalNetworkLength
      << ",\"transportCost\":" << metrics_.transportCost
      << ",\"deliveredNutrients\":" << metrics_.deliveredNutrients
      << ",\"efficiency\":" << metrics_.efficiency
      << ",\"averageShortestPath\":" << metrics_.averageShortestPath
      << ",\"nodes\":" << metrics_.nodes
      << ",\"edges\":" << metrics_.edges
      << ",\"activeEdges\":" << metrics_.activeEdges << "}}";
  return out.str();
}

} // namespace physarum
