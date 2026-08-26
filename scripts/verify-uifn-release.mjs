#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const secretPattern = new RegExp(`${['sk', 'live'].join('_')}_[a-z0-9_-]+`, 'gi');

function sanitize(value) {
  return String(value ?? '')
    .replace(secretPattern, '[REDACTED]')
    .replaceAll(repoRoot, '[REDACTED_LOCAL_PATH]')
    .replace(/\/(?:Users|root|tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+/g, '[REDACTED_LOCAL_PATH]')
    .replace(/[A-Z]:\\[^\s"',)]+/gi, '[REDACTED_LOCAL_PATH]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_PII]');
}

const stable = spawnSync(process.execPath, ['scripts/verify-uifn-stable.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
});

if (stable.status !== 0) {
  process.stdout.write(sanitize(stable.stdout));
  process.stderr.write(sanitize(stable.stderr));
  process.exit(stable.status ?? 1);
}

console.error(JSON.stringify({
  ok: false,
  command: 'verify:uifn-release',
  code: 'UIFN_RELEASE_PROGRAM_INCOMPLETE',
  message: 'The stable lane passes its current phase gates, but the 1.0 release program is not complete.',
}, null, 2));
process.exit(1);
