#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = spawn(process.execPath, ['./scripts/build.mjs'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

build.once('exit', (status) => {
  if (status !== 0) process.exit(status ?? 1);
  const tsup = path.resolve(packageRoot, '../..', 'node_modules', '.bin', process.platform === 'win32' ? 'tsup.cmd' : 'tsup');
  const watch = spawn(tsup, ['--watch'], {
    cwd: packageRoot,
    env: { ...process.env, UIFN_CORE_DEV_WATCH: '1' },
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => watch.kill(signal));
  }
  watch.once('exit', (watchStatus) => process.exit(watchStatus ?? 0));
});
