#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const stable = spawnSync(process.execPath, ['scripts/verify-uifn-stable.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
});

if (stable.status !== 0) {
  process.stdout.write(stable.stdout);
  process.stderr.write(stable.stderr);
  process.exit(stable.status ?? 1);
}

console.error(JSON.stringify({
  ok: false,
  command: 'verify:uifn-release',
  code: 'UIFN_RELEASE_PROGRAM_INCOMPLETE',
  message: 'The stable lane passes its current phase gates, but the 1.0 release program is not complete.',
}, null, 2));
process.exit(1);
