#include "Simulation.hpp"

#include <cstdint>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

using physarum::Simulation;

extern "C" {

EMSCRIPTEN_KEEPALIVE Simulation* createSimulation(int width, int height, int seed) {
  return new Simulation(width, height, static_cast<uint64_t>(seed));
}

EMSCRIPTEN_KEEPALIVE void destroySimulation(Simulation* sim) { delete sim; }

EMSCRIPTEN_KEEPALIVE void stepSimulation(Simulation* sim, double dt, int substeps) {
  if (sim) {
    sim->step(dt, substeps);
  }
}

EMSCRIPTEN_KEEPALIVE void resetSimulation(Simulation* sim, int seed) {
  if (sim) {
    sim->reset(static_cast<uint64_t>(seed));
  }
}

EMSCRIPTEN_KEEPALIVE void setParams(Simulation* sim, const char* paramsJson) {
  if (sim) {
    sim->setParamsJson(paramsJson);
  }
}

EMSCRIPTEN_KEEPALIVE void addAgents(Simulation* sim, double x, double y, int count, double radius) {
  if (sim) {
    sim->addAgents(x, y, count, radius);
  }
}

EMSCRIPTEN_KEEPALIVE void addFood(Simulation* sim, double x, double y, double calories, double radius, double attractorStrength) {
  if (sim) {
    sim->addFood(x, y, calories, radius, attractorStrength);
  }
}

EMSCRIPTEN_KEEPALIVE void eraseAt(Simulation* sim,
                                  double x,
                                  double y,
                                  double radius,
                                  int eraseSlime,
                                  int eraseFood,
                                  int eraseTrail,
                                  int eraseWall) {
  if (sim) {
    sim->eraseAt(x, y, radius, eraseSlime != 0, eraseFood != 0, eraseTrail != 0, eraseWall != 0);
  }
}

EMSCRIPTEN_KEEPALIVE void addWall(Simulation* sim, double x, double y, double radius) {
  if (sim) {
    sim->addWall(x, y, radius);
  }
}

EMSCRIPTEN_KEEPALIVE const char* getStatsJson(Simulation* sim) {
  return sim ? sim->statsJson() : "{}";
}

EMSCRIPTEN_KEEPALIVE unsigned char* getRenderBufferPtr(Simulation* sim) {
  return sim ? sim->renderBufferPtr() : nullptr;
}

EMSCRIPTEN_KEEPALIVE int getRenderBufferWidth(Simulation* sim) { return sim ? sim->renderBufferWidth() : 0; }

EMSCRIPTEN_KEEPALIVE int getRenderBufferHeight(Simulation* sim) { return sim ? sim->renderBufferHeight() : 0; }

EMSCRIPTEN_KEEPALIVE float* getAgentBufferPtr(Simulation* sim) { return sim ? sim->agentBufferPtr() : nullptr; }

EMSCRIPTEN_KEEPALIVE int getAgentCount(Simulation* sim) { return sim ? sim->agentCount() : 0; }

EMSCRIPTEN_KEEPALIVE const char* getNetworkJson(Simulation* sim) {
  return sim ? sim->networkJson() : "{\"nodes\":[],\"edges\":[]}";
}

EMSCRIPTEN_KEEPALIVE const char* exportStateJson(Simulation* sim) {
  return sim ? sim->exportStateJson() : "{}";
}

EMSCRIPTEN_KEEPALIVE void importStateJson(Simulation* sim, const char* json) {
  if (sim) {
    sim->importStateJson(json);
  }
}

}
