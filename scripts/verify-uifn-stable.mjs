#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const repoRoot = process.cwd();
const graph = JSON.parse(readFileSync('uifn/package-graph.json', 'utf8'));
const checks = [
  [process.execPath, ['scripts/verify-uifn-package-graph.mjs', '--stable-only']],
  [process.execPath, ['scripts/verify-uifn-clean.mjs']],
  ['npm', ['run', 'verify:uifn-governance']],
  [process.execPath, ['scripts/verify-uifn-catalog.mjs']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'build']],
  [process.execPath, ['--test', 'scripts/verify-uifn-dom-platform.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-dom-platform.mjs']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/solid', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'test:browser']],
  [process.execPath, ['--test', 'scripts/verify-uifn-runtime-architecture.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-runtime-architecture.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-core-node-matrix.mjs']],
  [process.execPath, ['--test', 'scripts/verify-uifn-package-graph.test.mjs', 'scripts/verify-uifn-clean.test.mjs']],
  ['npm', ['--workspace', '@uifn/components', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/registry', 'run', 'test:stable']],
  [process.execPath, ['scripts/verify-uifn-consumers.mjs']],
  [process.execPath, ['scripts/verify-uifn-pack.mjs']],
].map(([command, args]) => {
  const result = spawnSync(command, args, { cwd: repoRoot, env: process.env, encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-28).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-28).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-stable',
  mode: process.env.UIFN_EXPERIMENTAL_ABSENT === '1' ? 'experimental-directories-absent' : 'normal',
  graphSha256: createHash('sha256').update(JSON.stringify(graph)).digest('hex'),
  stablePackages: graph.stable.map((entry) => entry.name),
  checks,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
