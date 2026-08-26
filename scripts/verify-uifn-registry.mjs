#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { inspectPhase16 } from './verify-uifn-phase-16.mjs';

const npm = process.env.UIFN_NPM_PATH ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const checks = ['typecheck', 'test', 'build'].map((script) => {
  const result = spawnSync(npm, ['--workspace', '@uifn/registry', 'run', script], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return { script, passed: result.status === 0, status: result.status, stdoutTail: (result.stdout ?? '').split('\n').slice(-12).join('\n'), stderrTail: (result.stderr ?? '').split('\n').slice(-12).join('\n') };
});
const inspection = inspectPhase16();
const failures = [...inspection.failures, ...checks.filter((check) => !check.passed).map((check) => ({ code: 'UIFN_REGISTRY_COMMAND_FAILED', ...check }))];
const result = {
  ok: failures.length === 0,
  command: 'verify:uifn-registry',
  schemaVersion: 2,
  artifactCount: inspection.counts.components,
  templateCount: inspection.counts.templates,
  signature: inspection.signature,
  checks,
  failures,
};
(result.ok ? console.log : console.error)(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
