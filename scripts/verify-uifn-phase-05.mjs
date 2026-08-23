#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const commands = [
  [process.execPath, ['--test', 'scripts/verify-uifn-dom-platform.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-dom-platform.mjs', '--fixture-negative']],
  [process.execPath, ['scripts/verify-uifn-dom-pack.mjs']],
  [process.execPath, ['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command, args]) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-60).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-60).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-05',
  requirements: ['DOM-001', 'DOM-002', 'DOM-003', 'DOM-004', 'DOM-005', 'DOM-006', 'DOM-007'],
  vectors: Array.from({ length: 7 }, (_, index) => {
    const id = String(index + 1).padStart(3, '0');
    return [`TV-DOM-${id}-P`, `TV-DOM-${id}-N`];
  }).flat(),
  checks,
};

console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
