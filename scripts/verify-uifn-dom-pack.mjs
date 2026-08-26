#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const tempRoot = mkdtempSync(path.join(tmpdir(), 'uifn-dom-pack-'));
const packRoot = path.join(tempRoot, 'packs');
const consumerRoot = path.join(tempRoot, 'consumer');
mkdirSync(packRoot);
mkdirSync(consumerRoot);

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

try {
  run('npm', ['pack', '--silent', '--workspace', '@uifn/core', '--pack-destination', packRoot]);
  run('npm', ['pack', '--silent', '--workspace', '@uifn/dom', '--pack-destination', packRoot]);
  const tarballs = readdirSync(packRoot).filter((file) => file.endsWith('.tgz')).sort();
  const coreTarball = tarballs.find((file) => file.startsWith('uifn-core-'));
  const domTarball = tarballs.find((file) => file.startsWith('uifn-dom-'));
  if (!coreTarball || !domTarball) throw new Error(`Expected core/dom tarballs, received ${tarballs.join(', ')}`);
  const install = run('npm', [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    path.join(packRoot, coreTarball), path.join(packRoot, domTarball),
  ], consumerRoot);
  const imported = run(process.execPath, [
    '--input-type=module',
    '--eval',
    "const m=await import('@uifn/dom'); const required=['createUIFnDomScope','createUIFnDismissableLayerStack','createUIFnPositioner','createUIFnFormBridge']; for (const key of required) if(typeof m[key]!=='function') throw new Error('missing '+key); console.log(JSON.stringify({exports:required}))",
  ], consumerRoot);
  const extractRoot = path.join(tempRoot, 'extract');
  mkdirSync(extractRoot);
  run('tar', ['-xzf', path.join(packRoot, domTarball), '-C', extractRoot]);
  const packedDist = path.join(extractRoot, 'package', 'dist', 'index.mjs');
  const localDist = path.join(repoRoot, 'uifn/dom/dist/index.mjs');
  const result = {
    ok: sha256(packedDist) === sha256(localDist),
    command: 'verify:uifn-dom-pack',
    temporaryRoot: tempRoot,
    tarballs: tarballs.map((file) => ({ file, sha256: sha256(path.join(packRoot, file)) })),
    dist: { localSha256: sha256(localDist), packedSha256: sha256(packedDist) },
    cleanConsumerImport: JSON.parse(imported.stdout.trim()),
    installSummary: install.stdout.split('\n').filter(Boolean).slice(-3),
  };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    command: 'verify:uifn-dom-pack',
    temporaryRoot: tempRoot,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
