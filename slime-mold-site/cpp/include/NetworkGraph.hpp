#pragma once

#include "FieldGrid.hpp"
#include "FoodSource.hpp"
#include "Params.hpp"

#include <string>
#include <vector>

namespace physarum {

struct NetworkNode {
  int id = 0;
  Vec2 position;
  double pressure = 0.0;
  double supply = 0.0;
  bool isFood = false;
  bool isSink = false;
};

struct NetworkEdge {
  int a = 0;
  int b = 0;
  double length = 1.0;
  double conductivity = 0.1;
  double flow = 0.0;
  bool shortest = false;
  bool active = true;
};

struct NetworkMetrics {
  double totalNetworkLength = 0.0;
  double transportCost = 0.0;
  double deliveredNutrients = 0.0;
  double efficiency = 0.0;
  double averageShortestPath = 0.0;
  int nodes = 0;
  int edges = 0;
  int activeEdges = 0;
};

class NetworkGraph {
public:
  void clear();
  void buildFromFields(const FieldGrid& fields,
                       const std::vector<FoodSource>& foods,
                       Vec2 colonyCenter,
                       int liveAgents,
                       const Params& params);
  void solvePressure(const Params& params);
  void updateConductivity(double dt, const Params& params);
  void computeShortestPaths(const Params& params);
  void computeMetrics(const Params& params);

  const NetworkMetrics& metrics() const { return metrics_; }
  std::string toJson() const;

private:
  int addNode(Vec2 p, bool isFood, bool isSink);
  void addEdge(int a, int b, double length, double conductivity);
  int nearestNode(Vec2 p) const;
  std::vector<int> neighborsFor(int nodeId) const;

  std::vector<NetworkNode> nodes_;
  std::vector<NetworkEdge> edges_;
  NetworkMetrics metrics_;
};

} // namespace physarum
