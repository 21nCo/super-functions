#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir, platform, release, arch } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phase14ArtifactSetHash } from './verify-uifn-phase-14-compat.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export const phase14FrozenConsumerKitFiles = Object.freeze([
  'Phase14PublicTreeHarness.svelte',
  'Phase14ReactPublicTree.ts',
  'Phase14SolidPublicTree.tsx',
  'browser-main.ts',
  'browser-profile.ts',
  'browser-react.ts',
  'browser-runtime.ts',
  'browser-solid.tsx',
  'browser-svelte.ts',
  'browser-vite.config.mjs',
  'index.html',
  'node-smoke.mjs',
  'package.json',
  'react-ssr.test.tsx',
  'react-ssr.vitest.mjs',
  'react.test.tsx',
  'react.vitest.mjs',
  'solid.test.tsx',
  'solid.vitest.mjs',
  'svelte.test.ts',
  'svelte.vitest.mjs',
  'trace.mjs',
  'vectors.json',
]);

export function verifyPhase14FrozenBundle(bundleRoot, traceRun) {
  const expectedPackages = new Set(['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/react', '@uifn/svelte', '@uifn/solid']);
  if (!Array.isArray(traceRun.packages) || traceRun.packages.length !== expectedPackages.size || phase14ArtifactSetHash(traceRun.packages) !== traceRun.artifactSetSha256) {
    throw new Error('Frozen bundle artifact inventory is invalid.');
  }
  for (const entry of traceRun.packages) {
    if (!expectedPackages.delete(entry.package)) throw new Error(`Frozen bundle contains an unexpected or duplicate package: ${entry.package}`);
    const file = path.join(bundleRoot, 'tarballs', entry.filename);
    if (!existsSync(file) || sha256File(file) !== entry.sha256) throw new Error(`Frozen tarball hash mismatch: ${entry.filename}`);
  }
  const kit = path.join(bundleRoot, 'consumer-kit');
  const inventory = traceRun.consumerKit;
  if (inventory?.version !== 2 || !Array.isArray(inventory.files) || inventory.files.length !== phase14FrozenConsumerKitFiles.length) {
    throw new Error('Frozen consumer kit inventory is missing or incomplete.');
  }
  const expectedFiles = new Set(phase14FrozenConsumerKitFiles);
  for (const entry of inventory.files) {
    if (!entry || typeof entry.file !== 'string' || path.basename(entry.file) !== entry.file || !expectedFiles.delete(entry.file) || !/^[a-f0-9]{64}$/.test(entry.sha256 ?? '')) {
      throw new Error(`Frozen consumer kit contains an unexpected, duplicate, or invalid entry: ${entry?.file ?? '<missing>'}`);
    }
    const file = path.join(kit, entry.file);
    if (!existsSync(file) || sha256File(file) !== entry.sha256) throw new Error(`Frozen consumer kit hash mismatch: ${entry.file}`);
  }
  const inventoryHash = createHash('sha256').update(JSON.stringify([...inventory.files].sort((left, right) => left.file < right.file ? -1 : left.file > right.file ? 1 : 0))).digest('hex');
  if (inventoryHash !== inventory.sha256) throw new Error('Frozen consumer kit inventory hash mismatch.');
  return { ok: true, artifactSetSha256: traceRun.artifactSetSha256 };
}

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status}).\n${result.stdout ?? ''}\n${result.stderr ?? ''}`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cellId = requiredArgument('--cell');
  const major = Number(/^node-(20|22|24)$/.exec(cellId)?.[1]);
  if (!major) throw new Error(`Node cell runner cannot execute ${cellId}.`);
  if (Number(process.versions.node.split('.')[0]) !== major) throw new Error(`${cellId} MUST execute under Node ${major}.x; received ${process.version}.`);
  const bundleRoot = path.resolve(requiredArgument('--bundle'));
  const traceRunPath = path.join(bundleRoot, 'trace-run.json');
  if (!existsSync(traceRunPath)) throw new Error(`Frozen trace run is missing: ${traceRunPath}`);
  const traceRun = JSON.parse(readFileSync(traceRunPath, 'utf8'));
  verifyPhase14FrozenBundle(bundleRoot, traceRun);

  const workspace = mkdtempSync(path.join(tmpdir(), `uifn-phase-14-${cellId}-`));
  cpSync(path.join(bundleRoot, 'tarballs'), path.join(workspace, 'tarballs'), { recursive: true });
  cpSync(path.join(bundleRoot, 'consumer-kit'), path.join(workspace, 'consumer-kit'), { recursive: true });
  const consumerRoot = path.join(workspace, 'consumer-kit');
  const npmPath = process.env.UIFN_NPM_PATH ?? 'npm';
  const npmCache = path.join(workspace, 'npm-cache');
  run(npmPath, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot, { NPM_CONFIG_CACHE: npmCache });
  const smoke = run(process.execPath, ['node-smoke.mjs'], consumerRoot);
  const raw = smoke.stdout.trim().split('\n').at(-1);
  const payload = JSON.parse(raw);
  if (payload.ok !== true || payload.node !== process.version || payload.packages?.length !== 3) throw new Error('Packed Node smoke returned inconsistent observations.');

  const result = {
    cellId,
    status: 'passed',
    executedAt: new Date().toISOString(),
    command: `${process.execPath} node-smoke.mjs`,
    environment: {
      os: { name: platform(), version: release(), architecture: arch() },
      node: { version: process.version },
    },
    observed: {
      passed: true,
      failures: 0,
      packageCount: payload.packages.length,
      packages: payload.packages,
      resultSha256: createHash('sha256').update(raw).digest('hex'),
    },
  };
  const output = path.resolve(requiredArgument('--output'));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
}
