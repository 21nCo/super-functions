#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const distRoot = path.join(repoRoot, 'uifn/core/dist');
function runBuild() {
  const result = spawnSync('npm', ['--workspace', '@uifn/core', 'run', 'build'], { cwd: repoRoot, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
}
function digestDirectory(directory) {
  const hash = createHash('sha256');
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const absolute = path.join(current, name); const relative = path.relative(directory, absolute).replaceAll('\\', '/');
      if (statSync(absolute).isDirectory()) visit(absolute);
      else { hash.update(relative); hash.update('\0'); hash.update(readFileSync(absolute)); hash.update('\0'); }
    }
  };
  visit(directory); return hash.digest('hex');
}

try {
  runBuild(); const first = digestDirectory(distRoot);
  runBuild(); const second = digestDirectory(distRoot);
  const result = { ok: first === second, command: 'verify:uifn-core-reproducible', first, second };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-core-reproducible', error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
