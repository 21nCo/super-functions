#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'uifn/solid');
const dist = path.join(packageRoot, 'dist');
rmSync(dist, { recursive: true, force: true });

const result = spawnSync(process.execPath, [
  path.join(root, 'node_modules/typescript/bin/tsc'),
  '--project',
  path.join(packageRoot, 'tsconfig.build.json'),
], { cwd: root, env: process.env, encoding: 'utf8' });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const expected = ['index.js', 'index.d.ts', 'internal/compound.jsx', 'internal/compound.d.ts'];
const missing = expected.filter((relative) => !existsSync(path.join(dist, relative)));
const generated = path.join(dist, 'generated');
const generatedEntries = existsSync(generated)
  ? readdirSync(generated).filter((name) => name.endsWith('.jsx'))
  : [];
const catalog = JSON.parse(readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8'));
const expectedGeneratedEntries = catalog.primitives.length;
const rootSource = existsSync(path.join(dist, 'index.js')) ? readFileSync(path.join(dist, 'index.js'), 'utf8') : '';
const issues = [
  ...missing.map((relative) => `missing ${relative}`),
  ...(generatedEntries.length === expectedGeneratedEntries ? [] : [`expected ${expectedGeneratedEntries} generated JSX entries, received ${generatedEntries.length}`]),
  ...(rootSource.includes('React.createElement') ? ['Solid output contains React.createElement'] : []),
];

console[issues.length ? 'error' : 'log'](JSON.stringify({
  ok: issues.length === 0,
  command: 'build:uifn-solid',
  generatedEntries: generatedEntries.length,
  issues,
}, null, 2));
process.exit(issues.length ? 1 : 0);
