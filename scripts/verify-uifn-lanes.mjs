#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function child(script, env = process.env) {
  const result = spawnSync(process.execPath, [script], { cwd: process.cwd(), env, encoding: 'utf8' });
  return { ok: result.status === 0, status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

export function combineLaneResults(stable, experimental) {
  return {
    ok: stable.ok,
    command: 'verify:uifn-lanes',
    resultPolicy: 'stable-only',
    stable,
    experimental: { ...experimental, stableBlocking: false },
  };
}

export function runLaneVerification() {
  return combineLaneResults(
    child('scripts/verify-uifn-stable.mjs'),
    child('scripts/verify-uifn-experimental.mjs')
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runLaneVerification();
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
