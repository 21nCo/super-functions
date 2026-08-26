#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npx', ['tsc', '--noEmit', '-p', 'uifn/core/type-tests/tsconfig.json']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  [process.execPath, ['--test', 'scripts/verify-uifn-controller-contract.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-controller-contract.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-runtime-architecture.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-core-node-matrix.mjs']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/solid', 'run', 'typecheck']],
  ['npm', ['pack', '--dry-run', '--json', '--workspace', '@uifn/core']],
  [process.execPath, ['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command, args]) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
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
  command: 'verify:uifn-phase-04',
  requirements: ['ARCH-002', 'ARCH-003', 'PART-001', 'ENV-001'],
  vectors: [
    'TV-ARCH-002-P', 'TV-ARCH-002-N', 'TV-ARCH-003-P', 'TV-ARCH-003-N',
    'TV-PART-001-P', 'TV-PART-001-N', 'TV-ENV-001-P', 'TV-ENV-001-N',
  ],
  checks,
};

console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
