cmake_minimum_required(VERSION 3.20)
project(physarum_wasm_core LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(PHYSARUM_SOURCES
  src/Agent.cpp
  src/FoodSource.cpp
  src/FieldGrid.cpp
  src/NetworkGraph.cpp
  src/PhysarumSolver.cpp
  src/Simulation.cpp
)

add_library(physarum_core STATIC ${PHYSARUM_SOURCES})
target_include_directories(physarum_core PUBLIC include)
target_compile_options(physarum_core PRIVATE -Wall -Wextra -Wpedantic)

if(EMSCRIPTEN)
  add_executable(physarum_wasm ${PHYSARUM_SOURCES} src/bindings.cpp)
  target_include_directories(physarum_wasm PRIVATE include)
  target_compile_options(physarum_wasm PRIVATE -O3 -Wall -Wextra -Wpedantic)
  set(EXPORTED_FUNCTIONS
    "['_createSimulation','_destroySimulation','_stepSimulation','_resetSimulation','_setParams','_addAgents','_addFood','_eraseAt','_addWall','_getStatsJson','_getRenderBufferPtr','_getRenderBufferWidth','_getRenderBufferHeight','_getAgentBufferPtr','_getAgentCount','_getNetworkJson','_exportStateJson','_importStateJson']"
  )
  set_target_properties(physarum_wasm PROPERTIES
    OUTPUT_NAME "physarum"
    SUFFIX ".js"
    LINK_FLAGS "-O3 --no-entry -s WASM=1 -s MODULARIZE=1 -s EXPORT_ES6=1 -s EXPORT_NAME=createPhysarumModule -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_FUNCTIONS=${EXPORTED_FUNCTIONS} -s EXPORTED_RUNTIME_METHODS=['cwrap','ccall','UTF8ToString']"
  )
else()
  enable_testing()
  add_executable(test_energy tests/test_energy.cpp)
  target_link_libraries(test_energy PRIVATE physarum_core)
  add_test(NAME test_energy COMMAND test_energy)

  add_executable(test_graph tests/test_graph.cpp)
  target_link_libraries(test_graph PRIVATE physarum_core)
  add_test(NAME test_graph COMMAND test_graph)
endif()
