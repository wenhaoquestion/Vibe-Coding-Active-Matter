#include "FieldGrid.hpp"
#include "NetworkGraph.hpp"

#include <cassert>
#include <vector>

using namespace physarum;

int main() {
  Params params;
  params.graphStride = 8;
  params.trailThreshold = 0.2;
  params.trailMax = 10.0;
  FieldGrid grid(80, 64);
  for (int x = 8; x <= 72; ++x) {
    grid.addTrail(Vec2{static_cast<double>(x), 32.0}, 5.0, params.trailMax);
  }

  FoodSource food;
  food.id = 1;
  food.position = Vec2{8.0, 32.0};
  food.radius = 8.0;
  food.calories = 200.0;
  food.maxCalories = 200.0;
  food.attractorStrength = 20.0;
  food.enabled = true;
  std::vector<FoodSource> foods{food};

  NetworkGraph graph;
  graph.buildFromFields(grid, foods, Vec2{72.0, 32.0}, 10, params);
  graph.solvePressure(params);
  graph.updateConductivity(0.1, params);
  graph.computeShortestPaths(params);
  graph.computeMetrics(params);

  const NetworkMetrics& metrics = graph.metrics();
  assert(metrics.nodes > 0);
  assert(metrics.edges > 0);
  assert(metrics.totalNetworkLength > 0.0);
  assert(metrics.averageShortestPath > 0.0);
  return 0;
}
