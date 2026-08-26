#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const majors = [20, 22, 24];
const checks = majors.map((major) => {
  const result = spawnSync('npm', [
    'exec', '--yes', `--package=node@${major}`, '--',
    'node', 'scripts/verify-uifn-core-node-import.mjs',
  ], { cwd: process.cwd(), env: process.env, encoding: 'utf8' });
  let payload;
  try {
    payload = JSON.parse(result.stdout.trim().split('\n').at(-1));
  } catch {
    payload = null;
  }
  return {
    major,
    ok: result.status === 0 && payload?.ok === true && payload.node.startsWith(`v${major}.`),
    status: result.status,
    payload,
    stdout: result.stdout.trim().split('\n').slice(-8).join('\n'),
    stderr: result.stderr.trim().split('\n').slice(-8).join('\n'),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-core-node-matrix',
  requirement: 'CORE-002',
  nodeMajors: majors,
  checks,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
