#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const browserOutput = path.resolve(
  process.env.UIFN_PHASE11_BROWSER_OUTPUT
    ?? 'uifn/.conduct/evidence/phase-11/browser-latest'
);
const catalog = JSON.parse(readFileSync(path.resolve('uifn/catalog/generated/catalog.json'), 'utf8'));
const commands = [
  [process.execPath, ['scripts/generate-uifn-phase-11.mjs', '--check']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/core', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/dom', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/adapter-kit', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'typecheck']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'test']],
  ['npm', ['--workspace', '@uifn/react', 'run', 'build']],
  ['npm', ['--workspace', '@uifn/react', 'exec', '--', 'vitest', 'run', 'src/__tests__/phase-11-react-contract.test.tsx']],
  [process.execPath, ['scripts/verify-uifn-react-18-runtime.mjs']],
  [process.execPath, ['scripts/verify-uifn-react-19-consumer.mjs']],
  [process.execPath, ['--test', 'scripts/verify-uifn-phase-11-contract.test.mjs']],
  [process.execPath, ['scripts/verify-uifn-phase-11-contract.mjs', '--require-dist']],
  ['npx', ['playwright', 'test', 'browser/phase11-react.spec.ts', '--config=playwright.config.ts'], {
    cwd: path.resolve('uifn/dom'),
    UIFN_PHASE11_BROWSER_OUTPUT: browserOutput,
  }],
  [process.execPath, ['scripts/verify-uifn-pack.mjs']],
];

const checks = commands.map(([command, args, options = {}]) => {
  const cwd = options.cwd ?? process.cwd();
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...options },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    cwd,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-120).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-120).join('\n').trim(),
  };
});

const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-11',
  requirement: 'REACT-001',
  vectors: ['TV-REACT-001-P', 'TV-REACT-001-N'],
  primitiveCount: catalog.primitives.length,
  runtimes: ['react-18.3.1', 'react-19.2.3'],
  browsers: ['chromium', 'firefox', 'webkit'],
  browserOutput,
  checks,
};
const evidenceOutput = process.env.UIFN_PHASE11_EVIDENCE_OUTPUT;
if (evidenceOutput) {
  const absolute = path.resolve(evidenceOutput);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`);
}
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
