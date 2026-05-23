#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/cpp/build-wasm"
OUT_DIR="$ROOT_DIR/public/wasm"

if ! command -v emcmake >/dev/null 2>&1; then
  echo "emcmake was not found. Install and activate Emscripten first:" >&2
  echo "  git clone https://github.com/emscripten-core/emsdk.git" >&2
  echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest" >&2
  echo "  source ./emsdk_env.sh" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR" "$OUT_DIR"
emcmake cmake -S "$ROOT_DIR/cpp" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release
cmake --build "$BUILD_DIR" --target physarum_wasm -j
cp "$BUILD_DIR/physarum.js" "$OUT_DIR/physarum.js"
cp "$BUILD_DIR/physarum.wasm" "$OUT_DIR/physarum.wasm"
echo "WASM build written to $OUT_DIR"
