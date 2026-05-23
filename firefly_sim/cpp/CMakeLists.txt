cmake_minimum_required(VERSION 3.16)
project(firefly_sim LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(firefly_core firefly.cpp)
target_include_directories(firefly_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(firefly_tests tests/test_firefly.cpp)
target_link_libraries(firefly_tests PRIVATE firefly_core)
