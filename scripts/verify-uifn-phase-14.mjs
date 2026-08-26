#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const evidenceRoot = path.resolve(
  process.env.UIFN_PHASE14_EVIDENCE_ROOT
    ?? `uifn/.conduct/evidence/phase-14/${timestamp}-PHASE-14-${randomBytes(4).toString('hex')}`,
);
const traceRoot = path.join(evidenceRoot, 'traces');
const compatibilityInput = path.join(evidenceRoot, 'compatibility-input');
mkdirSync(traceRoot, { recursive: true });
mkdirSync(compatibilityInput, { recursive: true });

const npmPath = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
const nodePath = process.execPath;
const checks = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const check = {
    id: options.id ?? [command, ...args].join(' '),
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? '').split('\n').slice(-100).join('\n').trim(),
    stderr: (result.stderr ?? '').split('\n').slice(-100).join('\n').trim(),
  };
  checks.push(check);
  return check;
}

const implementationCommands = [
  [nodePath, ['scripts/generate-uifn-phase-14.mjs', '--check'], 'vectors'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/core'], 'core-typecheck'],
  [npmPath, ['run', 'test', '--workspace=@uifn/core'], 'core-test'],
  [npmPath, ['run', 'build', '--workspace=@uifn/core'], 'core-build'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/dom'], 'dom-typecheck'],
  [npmPath, ['run', 'test', '--workspace=@uifn/dom'], 'dom-test'],
  [npmPath, ['run', 'build', '--workspace=@uifn/dom'], 'dom-build'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/adapter-kit'], 'adapter-typecheck'],
  [npmPath, ['run', 'test', '--workspace=@uifn/adapter-kit'], 'adapter-test'],
  [npmPath, ['run', 'build', '--workspace=@uifn/adapter-kit'], 'adapter-build'],
  [nodePath, ['--test', 'scripts/verify-uifn-phase-14-adapter.test.mjs'], 'adapter-negative'],
  [nodePath, ['scripts/verify-uifn-phase-14-adapter.mjs'], 'adapter-static'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/react'], 'react-typecheck'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/svelte'], 'svelte-typecheck'],
  [npmPath, ['run', 'typecheck', '--workspace=@uifn/solid'], 'solid-typecheck'],
  [nodePath, ['--test', 'scripts/verify-uifn-phase-14-compat.test.mjs'], 'compat-contract'],
  [nodePath, ['--test', 'scripts/create-uifn-phase-14-compat-evidence.test.mjs'], 'compat-evidence-producer'],
  [nodePath, ['--test', 'scripts/run-uifn-phase-14-node-cell.test.mjs'], 'compat-frozen-bundle'],
  [nodePath, ['--test', 'scripts/run-uifn-phase-14-react-rsc-cell.test.mjs'], 'compat-react-rsc-runner'],
  [nodePath, ['--test', 'scripts/run-uifn-phase-14-browser-cell.test.mjs'], 'compat-browser-runner'],
  [nodePath, ['--test', 'scripts/extract-uifn-phase-14-framework-cell.test.mjs'], 'compat-framework-extractor'],
  [nodePath, ['--test', 'scripts/verify-uifn-phase-14-workflow.test.mjs'], 'compat-workflow-negative'],
  [nodePath, ['scripts/verify-uifn-phase-14-workflow.mjs'], 'compat-workflow-contract'],
];
for (const [command, args, id] of implementationCommands) run(command, args, { id });

const traceRun = run(nodePath, ['scripts/run-uifn-phase-14-traces.mjs', '--output-dir', traceRoot], { id: 'actual-source-packed-traces' });
if (traceRun.ok) {
  run(nodePath, [
    'scripts/verify-uifn-phase-14-parity.mjs',
    '--trace-dir', traceRoot,
    '--output', path.join(evidenceRoot, 'parity.json'),
  ], { id: 'parity-golden' });
  run(nodePath, ['--test', 'scripts/verify-uifn-phase-14-parity.test.mjs'], {
    id: 'parity-mutations',
    env: { UIFN_PHASE14_TRACE_DIR: traceRoot },
  });
  run(nodePath, [
    'scripts/verify-uifn-phase-14-compat.mjs',
    '--trace-run', path.join(traceRoot, 'trace-run.json'),
    '--evidence-dir', compatibilityInput,
    '--output', path.join(evidenceRoot, 'compatibility.json'),
  ], { id: 'signed-compatibility-matrix' });
  const localBrowserExecutable = process.env.UIFN_PHASE14_LOCAL_BROWSER_EXECUTABLE;
  if (localBrowserExecutable) {
    run(nodePath, [
      'scripts/run-uifn-phase-14-browser-cell.mjs',
      '--cell', 'chrome-latest',
      '--browser', 'chrome',
      '--bundle', traceRoot,
      '--driver', 'playwright-product',
      '--executable', localBrowserExecutable,
      '--output', path.join(evidenceRoot, 'chrome-latest.local.result.json'),
    ], { id: 'local-exact-chrome-all-tree-smoke' });
    const localRenderingProfile = process.env.UIFN_PHASE14_LOCAL_RENDER_PROFILE;
    if (localRenderingProfile) {
      run(nodePath, [
        'scripts/run-uifn-phase-14-browser-cell.mjs',
        '--cell', `render-${localRenderingProfile}`,
        '--browser', 'chrome',
        '--bundle', traceRoot,
        '--driver', 'playwright-product',
        '--executable', localBrowserExecutable,
        '--output', path.join(evidenceRoot, `render-${localRenderingProfile}.local.result.json`),
      ], { id: `local-render-${localRenderingProfile}-all-tree-smoke` });
    }
  }
}

run('git', ['diff', '--check'], { id: 'diff-check' });

const compatibility = checks.find((check) => check.id === 'signed-compatibility-matrix');
const implementationChecks = checks.filter((check) => check.id !== 'signed-compatibility-matrix');
const result = {
  ok: checks.every((check) => check.ok),
  status: compatibility?.ok === false && implementationChecks.every((check) => check.ok)
    ? 'BLOCKED_EXTERNAL_MATRIX'
    : (checks.every((check) => check.ok) ? 'PASS' : 'FAIL'),
  command: 'verify:uifn-phase-14',
  requirements: ['ADAPT-001', 'PARITY-001', 'COMPAT-001'],
  vectors: ['TV-ADAPT-001-P', 'TV-ADAPT-001-N', 'TV-PARITY-001-P', 'TV-PARITY-001-N', 'TV-COMPAT-001-P', 'TV-COMPAT-001-N'],
  evidenceRoot,
  implementationChecksOk: implementationChecks.every((check) => check.ok),
  compatibilityMatrixOk: compatibility?.ok ?? false,
  checks,
};
writeFileSync(path.join(evidenceRoot, 'phase-14.json'), `${JSON.stringify(result, null, 2)}\n`);
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
