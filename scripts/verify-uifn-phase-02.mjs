#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const commands = [
  [process.execPath, ['--test', 'scripts/verify-uifn-catalog.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command, args]) => {
  const result = spawnSync(command, args, { cwd: repoRoot, env: process.env, encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-36).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-36).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-02',
  requirement: 'CAT-001',
  vectors: ['TV-CAT-001-P', 'TV-CAT-001-N'],
  checks,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
