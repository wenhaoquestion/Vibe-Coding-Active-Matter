#pragma once

#include "FieldGrid.hpp"
#include "FoodSource.hpp"
#include "NetworkGraph.hpp"
#include "Params.hpp"

#include <string>
#include <vector>

namespace physarum {

class PhysarumSolver {
public:
  void reset();
  void update(const FieldGrid& fields,
              const std::vector<FoodSource>& foods,
              Vec2 colonyCenter,
              int liveAgents,
              double dt,
              const Params& params);

  const NetworkMetrics& metrics() const { return graph_.metrics(); }
  std::string toJson() const { return graph_.toJson(); }

private:
  NetworkGraph graph_;
};

} // namespace physarum
