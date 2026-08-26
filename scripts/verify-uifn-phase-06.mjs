#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  [process.execPath, ['--test', 'scripts/verify-uifn-phase-06-contract.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-phase-06-contract.mjs', '--require-dist']],
  [process.execPath, ['scripts/generate-uifn-phase-06.mjs', '--check']],
  [process.execPath, ['scripts/verify-uifn-core-reproducible.mjs']],
  [process.execPath, ['scripts/verify-uifn-foundation-pack.mjs']],
  [process.execPath, ['scripts/verify-uifn-controller-contract.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-runtime-architecture.mjs', '--require-dist']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/solid', 'run', 'typecheck']],
  [process.execPath, ['scripts/generate-uifn-catalog.mjs', '--check']],
  [process.execPath, ['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command, args]) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { command: [command, ...args].join(' '), ok: result.status === 0, status: result.status, stdout: result.stdout.split('\n').slice(-60).join('\n').trim(), stderr: result.stderr.split('\n').slice(-60).join('\n').trim() };
});
const result = { ok: checks.every((check) => check.ok), command: 'verify:uifn-phase-06', requirements: ['CAT-002', 'PRIM-001'], vectors: ['TV-CAT-002-P', 'TV-CAT-002-N', 'TV-PRIM-001-P', 'TV-PRIM-001-N'], checks };
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
