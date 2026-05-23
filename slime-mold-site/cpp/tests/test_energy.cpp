#include "Simulation.hpp"

#include <cassert>
#include <cstdlib>
#include <string>

using physarum::Simulation;

namespace {

double readNumber(const std::string& json, const std::string& key) {
  const std::string needle = "\"" + key + "\"";
  const std::size_t pos = json.find(needle);
  assert(pos != std::string::npos);
  const std::size_t colon = json.find(':', pos + needle.size());
  assert(colon != std::string::npos);
  return std::strtod(json.c_str() + colon + 1, nullptr);
}

} // namespace

int main() {
  Simulation hungry(96, 96, 7);
  hungry.setParamsJson(
      "{\"initialEnergy\":40,\"energyMax\":100,\"baseEnergyCost\":5,"
      "\"moveEnergyCost\":0.1,\"sensorEnergyCost\":0.1,\"trailEnergyCost\":0.1,"
      "\"solverEnabled\":false}");
  hungry.addAgents(48, 48, 1, 0);
  hungry.step(1.0, 4);
  const double energyAfterHunger = readNumber(hungry.statsJson(), "averageEnergy");
  assert(energyAfterHunger < 40.0);

  Simulation fed(96, 96, 7);
  fed.setParamsJson(
      "{\"initialEnergy\":30,\"energyMax\":100,\"eatRate\":80,\"foodEnergyEfficiency\":2.0,"
      "\"speedMin\":0,\"speedMax\":0,\"baseEnergyCost\":0.1,\"solverEnabled\":false}");
  fed.addAgents(48, 48, 1, 0);
  fed.addFood(48, 48, 300, 12, 20);
  fed.step(0.5, 4);
  const std::string stats = fed.statsJson();
  assert(readNumber(stats, "averageEnergy") > 30.0);
  assert(readNumber(stats, "foodRemaining") < 300.0);
  return 0;
}
