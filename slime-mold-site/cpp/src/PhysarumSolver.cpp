#include "PhysarumSolver.hpp"

namespace physarum {

void PhysarumSolver::reset() { graph_.clear(); }

void PhysarumSolver::update(const FieldGrid& fields,
                            const std::vector<FoodSource>& foods,
                            Vec2 colonyCenter,
                            int liveAgents,
                            double dt,
                            const Params& params) {
  graph_.buildFromFields(fields, foods, colonyCenter, liveAgents, params);
  graph_.solvePressure(params);
  graph_.updateConductivity(dt, params);
  graph_.computeShortestPaths(params);
  graph_.computeMetrics(params);
}

} // namespace physarum
