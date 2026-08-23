#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const commands = [
  [process.execPath, ['scripts/generate-uifn-phase-12.mjs', '--check']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/svelte', 'run', 'build']],
  [process.execPath, ['--test', 'scripts/verify-uifn-phase-12-contract.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-phase-12-contract.mjs', '--require-dist']],
  [process.execPath, ['scripts/verify-uifn-svelte-consumer.mjs']],
  [process.execPath, ['scripts/verify-uifn-pack.mjs']],
];
const catalog = JSON.parse(readFileSync(path.resolve('uifn/catalog/generated/catalog.json'), 'utf8'));
const anatomyCount = catalog.primitives.reduce((count, primitive) => count + primitive.anatomy.length, 0);

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
    stdout: result.stdout.split('\n').slice(-100).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-100).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-12',
  requirement: 'SVELTE-001',
  vectors: ['TV-SVELTE-001-P', 'TV-SVELTE-001-N'],
  primitiveCount: catalog.primitives.length,
  anatomyCount,
  browsers: ['chromium', 'firefox', 'webkit'],
  checks,
};
const evidenceOutput = process.env.UIFN_PHASE12_EVIDENCE_OUTPUT;
if (evidenceOutput) {
  const absolute = path.resolve(evidenceOutput);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
}
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
