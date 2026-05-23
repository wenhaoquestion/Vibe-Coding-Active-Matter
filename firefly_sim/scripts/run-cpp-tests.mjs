import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, '.tmp');
mkdirSync(outDir, { recursive: true });
const exe = resolve(outDir, process.platform === 'win32' ? 'firefly_tests.exe' : 'firefly_tests');

const compilers = process.platform === 'win32' ? ['g++', 'clang++'] : ['c++', 'g++', 'clang++'];
let compiled = false;
let lastStatus = 1;

for (const compiler of compilers) {
  const build = spawnSync(
    compiler,
    ['-std=c++17', '-O2', '-Icpp', 'cpp/firefly.cpp', 'cpp/tests/test_firefly.cpp', '-o', exe],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
  );
  if (build.status === 0) {
    compiled = true;
    break;
  }
  lastStatus = build.status ?? 1;
}

if (!compiled) {
  console.error('No working C++17 compiler was found for the native tests.');
  process.exit(lastStatus);
}

const run = spawnSync(exe, [], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
process.exit(run.status ?? 1);
