#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
const node = process.env.UIFN_NODE_PATH ?? '/opt/homebrew/bin/node';
const expectedComponentCount = JSON.parse(
  readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8'),
).primitives.length;
const workspace = mkdtempSync(path.join(tmpdir(), 'uifn-phase15-consumers-'));
const tarballRoot = path.join(workspace, 'tarballs');
mkdirSync(tarballRoot, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/bin:/bin' }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: result.status === 0, status: result.status, command: [command, ...args].join(' '), stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function requirePass(result) {
  if (!result.ok) throw new Error(`${result.command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
}

function parsePack(stdout) {
  for (let index = stdout.lastIndexOf('['); index >= 0; index = stdout.lastIndexOf('[', index - 1)) {
    try {
      const value = JSON.parse(stdout.slice(index));
      if (Array.isArray(value) && value[0]?.filename) return value[0];
    } catch {}
  }
  throw new Error('npm pack did not return its JSON document.');
}

function sha256(pathname) { return createHash('sha256').update(readFileSync(pathname)).digest('hex'); }

const sharedPackages = ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/tokens', '@uifn/theme', '@uifn/recipes', '@uifn/components'];
const frameworkPackages = {
  react: ['@uifn/react', '@uifn/components-react'],
  svelte: ['@uifn/svelte', '@uifn/components-svelte'],
  solid: ['@uifn/solid', '@uifn/components-solid'],
};
const allPackages = [...sharedPackages, ...Object.values(frameworkPackages).flat()];
const tarballs = {};

try {
  for (const packageName of allPackages) {
    const packed = run(npm, ['pack', '--workspace', packageName, '--json', '--pack-destination', tarballRoot]);
    requirePass(packed);
    const metadata = parsePack(packed.stdout);
    const pathname = path.join(tarballRoot, metadata.filename);
    tarballs[packageName] = { pathname, filename: metadata.filename, sha256: sha256(pathname), files: metadata.files?.map((file) => file.path) ?? [] };
  }

  const consumers = [];
  const forbiddenByFramework = {
    react: ['svelte', 'solid-js', '@uifn/svelte', '@uifn/solid', '@uifn/components-svelte', '@uifn/components-solid'],
    svelte: ['react', 'react-dom', 'solid-js', '@uifn/react', '@uifn/solid', '@uifn/components-react', '@uifn/components-solid'],
    solid: ['react', 'react-dom', 'svelte', '@uifn/react', '@uifn/svelte', '@uifn/components-react', '@uifn/components-svelte'],
  };

  for (const framework of ['react', 'svelte', 'solid']) {
    const consumerRoot = path.join(workspace, framework);
    mkdirSync(consumerRoot, { recursive: true });
    const localPackages = [...sharedPackages, ...frameworkPackages[framework]];
    const dependencies = Object.fromEntries(localPackages.map((name) => [name, `file:${tarballs[name].pathname}`]));
    if (framework === 'react') Object.assign(dependencies, { react: '18.3.1', 'react-dom': '18.3.1' });
    if (framework === 'svelte') Object.assign(dependencies, { svelte: '5.46.4' });
    if (framework === 'solid') Object.assign(dependencies, { 'solid-js': '1.9.13' });
    writeFileSync(path.join(consumerRoot, 'package.json'), `${JSON.stringify({ name: `uifn-phase15-${framework}-consumer`, private: true, type: 'module', dependencies }, null, 2)}\n`);
    const install = run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot);
    requirePass(install);
    const modules = new Set([
      ...readdirSync(path.join(consumerRoot, 'node_modules')).filter((name) => !name.startsWith('.')),
      ...readdirSync(path.join(consumerRoot, 'node_modules/@uifn')).map((name) => `@uifn/${name}`),
    ]);
    const forbidden = forbiddenByFramework[framework].filter((name) => modules.has(name));
    if (forbidden.length) throw new Error(`UIFN_STYLED_FRAMEWORK_COUPLING ${framework}: ${forbidden.join(', ')}`);
    const styledPackage = `@uifn/components-${framework}`;
    const smoke = framework !== 'react'
      ? run(node, ['--input-type=module', '-e', `import{readFileSync}from'node:fs';const p=JSON.parse(readFileSync('node_modules/${styledPackage}/package.json','utf8'));const e=p.exports['.'];const w=p.exports['./*'];const s=readFileSync('node_modules/${styledPackage}/dist/index.js','utf8');const b=readFileSync('node_modules/${styledPackage}/dist/generated/button${framework === 'svelte' ? '/index.js' : '.mjs'}','utf8');if(!${framework === 'svelte' ? 'e.svelte' : 'e.import'}||!w||!s.includes('componentCount: ${expectedComponentCount}')||!b.includes('ButtonRoot'))process.exit(2)`], consumerRoot)
      : run(node, ['--input-type=module', '-e', `Promise.all([import('${styledPackage}'),import('${styledPackage}/button')]).then(([m,b])=>{if(m.componentsReactPackageBoundary.componentCount!==${expectedComponentCount}||!b.ButtonRoot||!b.Button.Root)process.exit(2)})`], consumerRoot);
    requirePass(smoke);
    consumers.push({ framework, package: styledPackage, installedUifnPackages: [...modules].filter((name) => name.startsWith('@uifn/')).sort(), forbiddenInstalled: forbidden, rootEntry: framework === 'react' ? 'imported' : `compiled-${framework}-entry-validated`, primitiveSubpath: framework === 'react' ? 'button-imported' : `compiled-button-subpath-validated`, lockfileSha256: sha256(path.join(consumerRoot, 'package-lock.json')) });
  }

  const result = { schemaVersion: 1, phase: 'PHASE_15', vector: 'TV-COMP-001-P', status: 'passed', tarballs: Object.fromEntries(Object.entries(tarballs).map(([name, value]) => [name, { filename: value.filename, sha256: value.sha256, fileCount: value.files.length }])), consumers };
  const output = process.env.UIFN_PHASE15_CONSUMER_EVIDENCE;
  if (output) { mkdirSync(path.dirname(path.resolve(output)), { recursive: true }); writeFileSync(path.resolve(output), `${JSON.stringify(result, null, 2)}\n`); }
  console.log(JSON.stringify({ ok: true, vector: result.vector, consumerCount: consumers.length, consumers, evidence: output ? path.resolve(output) : null }, null, 2));
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
