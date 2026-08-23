#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  [process.execPath, ['--test', 'scripts/verify-uifn-runtime-architecture.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-runtime-architecture.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-core-node-matrix.mjs']],
  [process.execPath, ['scripts/benchmark-uifn-core-runtime.mjs']],
  [process.execPath, ['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command, args]) => {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-40).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-40).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-03',
  requirements: ['ARCH-001', 'CORE-001', 'CORE-002', 'CORE-003', 'CORE-004'],
  vectors: [
    'TV-ARCH-001-P', 'TV-ARCH-001-N',
    'TV-CORE-001-P', 'TV-CORE-001-N', 'TV-CORE-002-P', 'TV-CORE-002-N',
    'TV-CORE-003-P', 'TV-CORE-003-N', 'TV-CORE-004-P', 'TV-CORE-004-N',
  ],
  checks,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
