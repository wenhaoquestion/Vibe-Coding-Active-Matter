import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, "");
const buildDir = resolve(root, ".cpp-test-build");
mkdirSync(buildDir, { recursive: true });

const compiler = spawnSync("clang++", ["--version"], { encoding: "utf8" }).status === 0 ? "clang++" : "g++";
const out = resolve(buildDir, "physarum_tests");
const compile = spawnSync(compiler, [
  "-std=c++20",
  "-O2",
  "-Wall",
  "-Wextra",
  "-I", resolve(root, "cpp"),
  resolve(root, "cpp/physarum.cpp"),
  resolve(root, "cpp/tests/test_physarum.cpp"),
  "-o", out
], { stdio: "inherit" });

if (compile.status !== 0) process.exit(compile.status ?? 1);

const run = spawnSync(out, [], { stdio: "inherit" });
process.exit(run.status ?? 1);
