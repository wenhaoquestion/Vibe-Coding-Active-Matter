$ErrorActionPreference = "Stop"

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $RootDir "cpp/build-wasm"
$OutDir = Join-Path $RootDir "public/wasm"

if (-not (Get-Command emcmake -ErrorAction SilentlyContinue)) {
  Write-Error "emcmake was not found. Install and activate Emscripten first: https://emscripten.org/docs/getting_started/downloads.html"
}

New-Item -ItemType Directory -Force -Path $BuildDir, $OutDir | Out-Null
emcmake cmake -S (Join-Path $RootDir "cpp") -B $BuildDir -DCMAKE_BUILD_TYPE=Release
cmake --build $BuildDir --target physarum_wasm --config Release
Copy-Item (Join-Path $BuildDir "physarum.js") (Join-Path $OutDir "physarum.js") -Force
Copy-Item (Join-Path $BuildDir "physarum.wasm") (Join-Path $OutDir "physarum.wasm") -Force
Write-Host "WASM build written to $OutDir"
