#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const holdingRoot = path.join(repoRoot, 'uifn', '.conduct', '.phase-01-experimental-absent');
const packages = ['patterns', 'sf'];
mkdirSync(holdingRoot, { recursive: true });

try {
  for (const packageName of packages) {
    const source = path.join(repoRoot, 'uifn', packageName);
    const target = path.join(holdingRoot, packageName);
    if (existsSync(source)) renameSync(source, target);
  }
  const result = spawnSync(process.execPath, ['scripts/verify-uifn-stable.mjs'], {
    cwd: repoRoot,
    env: { ...process.env, UIFN_EXPERIMENTAL_ABSENT: '1' },
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.status ?? 1;
} finally {
  for (const packageName of [...packages].reverse()) {
    const source = path.join(holdingRoot, packageName);
    const target = path.join(repoRoot, 'uifn', packageName);
    if (existsSync(source)) renameSync(source, target);
  }
  rmSync(holdingRoot, { recursive: true, force: true });
}
