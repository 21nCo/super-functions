#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const graph = JSON.parse(readFileSync(path.join(repoRoot, 'uifn', 'package-graph.json'), 'utf8'));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'uifn-consumers-'));
const packRoot = path.join(tempRoot, 'packs');
const failures = [];
const artifactHashes = {};
const commonPackages = ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit'];
const consumers = [
  { framework: 'react', packageName: '@uifn/react', peers: { react: '18.3.1', 'react-dom': '18.3.1' } },
  {
    framework: 'svelte',
    packageName: '@uifn/svelte',
    peers: { svelte: '5.46.4' },
    tooling: { vite: '5.4.21', '@sveltejs/vite-plugin-svelte': '4.0.4' },
  },
  {
    framework: 'solid',
    packageName: '@uifn/solid',
    peers: { 'solid-js': '1.9.13' },
    tooling: { vite: '5.4.21', 'vite-plugin-solid': '2.11.12' },
  },
];

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, env: process.env, encoding: 'utf8' });
}

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function sanitize(value) {
  return String(value).replaceAll(repoRoot, '[REPO]').replaceAll(tempRoot, '[TEMP]').split('\n').slice(-18).join('\n').trim();
}

function parsePackOutput(stdout) {
  const source = String(stdout).trim();
  for (let index = source.lastIndexOf('['); index >= 0; index = source.lastIndexOf('[', index - 1)) {
    try {
      const value = JSON.parse(source.slice(index));
      if (Array.isArray(value)) return value;
    } catch {
      // Prepack scripts may print before npm's JSON result; keep searching backward.
    }
  }
  return undefined;
}

function pack(packageName) {
  const result = run('npm', ['pack', '--workspace', packageName, '--pack-destination', packRoot, '--json'], repoRoot);
  if (result.status !== 0) {
    fail('UIFN_CONSUMER_PACK_FAILED', { package: packageName, stdout: sanitize(result.stdout), stderr: sanitize(result.stderr) });
    return undefined;
  }
  const parsed = parsePackOutput(result.stdout);
  if (!parsed) {
    fail('UIFN_CONSUMER_PACK_OUTPUT_INVALID', { package: packageName, stdout: sanitize(result.stdout) });
    return undefined;
  }
  const filename = parsed[0]?.filename;
  if (!filename) {
    fail('UIFN_CONSUMER_PACK_OUTPUT_INVALID', { package: packageName });
    return undefined;
  }
  const pathname = path.join(packRoot, filename);
  artifactHashes[packageName] = createHash('sha256').update(readFileSync(pathname)).digest('hex');
  return pathname;
}

const tarballs = new Map();
try {
  const mkdir = run('mkdir', ['-p', packRoot], repoRoot);
  if (mkdir.status !== 0) fail('UIFN_CONSUMER_TEMP_FAILED');
  for (const packageName of [...commonPackages, ...consumers.map((consumer) => consumer.packageName)]) {
    tarballs.set(packageName, pack(packageName));
  }

  const results = [];
  for (const consumer of consumers) {
    const consumerRoot = path.join(tempRoot, consumer.framework);
    const create = run('mkdir', ['-p', consumerRoot], repoRoot);
    if (create.status !== 0) {
      fail('UIFN_CONSUMER_TEMP_FAILED', { framework: consumer.framework });
      continue;
    }
    const localPackages = [...commonPackages, consumer.packageName];
    const dependencies = Object.fromEntries(localPackages.map((packageName) => [packageName, `file:${tarballs.get(packageName)}`]));
    Object.assign(dependencies, consumer.peers);
    Object.assign(dependencies, consumer.tooling ?? {});
    writeFileSync(path.join(consumerRoot, 'package.json'), `${JSON.stringify({
      name: `uifn-${consumer.framework}-consumer`,
      private: true,
      type: 'module',
      dependencies,
    }, null, 2)}\n`);

    const install = run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot);
    if (install.status !== 0) {
      fail('UIFN_CONSUMER_INSTALL_FAILED', { framework: consumer.framework, stdout: sanitize(install.stdout), stderr: sanitize(install.stderr) });
      continue;
    }
    let importResult;
    let importMode = 'node-esm';
    if (consumer.framework === 'svelte') {
      importMode = 'svelte-vite-production-build';
      const sourceRoot = path.join(consumerRoot, 'src');
      const createSource = run('mkdir', ['-p', sourceRoot], repoRoot);
      if (createSource.status !== 0) {
        fail('UIFN_CONSUMER_TEMP_FAILED', { framework: consumer.framework });
        continue;
      }
      writeFileSync(path.join(sourceRoot, 'App.svelte'), `<script>
  import { Accordion } from '@uifn/svelte';
</script>

<Accordion.Root>
  <Accordion.Item value="one">
    <Accordion.Header value="one">
      <Accordion.Trigger value="one">One</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content value="one">Content</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
`);
      writeFileSync(path.join(sourceRoot, 'main.js'), `import { mount } from 'svelte';\nimport App from './App.svelte';\nmount(App, { target: document.querySelector('#app') });\n`);
      writeFileSync(path.join(consumerRoot, 'index.html'), '<main id="app"></main><script type="module" src="/src/main.js"></script>\n');
      writeFileSync(path.join(consumerRoot, 'vite.config.mjs'), `import { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default { logLevel: 'error', plugins: [svelte()] };\n`);
      importResult = run(process.execPath, [path.join(consumerRoot, 'node_modules/vite/bin/vite.js'), 'build'], consumerRoot);
    } else if (consumer.framework === 'solid') {
      importMode = 'solid-vite-production-build';
      const sourceRoot = path.join(consumerRoot, 'src');
      const createSource = run('mkdir', ['-p', sourceRoot], repoRoot);
      if (createSource.status !== 0) {
        fail('UIFN_CONSUMER_TEMP_FAILED', { framework: consumer.framework });
        continue;
      }
      writeFileSync(path.join(sourceRoot, 'App.tsx'), `import { Checkbox } from '@uifn/solid';\nexport default function App() { return <Checkbox.Root><Checkbox.Control>Accept</Checkbox.Control></Checkbox.Root>; }\n`);
      writeFileSync(path.join(sourceRoot, 'main.tsx'), `import { render } from 'solid-js/web';\nimport App from './App';\nrender(() => <App />, document.querySelector('#app'));\n`);
      writeFileSync(path.join(consumerRoot, 'index.html'), '<main id="app"></main><script type="module" src="/src/main.tsx"></script>\n');
      writeFileSync(path.join(consumerRoot, 'vite.config.mjs'), `import solid from 'vite-plugin-solid';\nexport default { logLevel: 'error', plugins: [solid({ hot: false })] };\n`);
      importResult = run(process.execPath, [path.join(consumerRoot, 'node_modules/vite/bin/vite.js'), 'build'], consumerRoot);
    } else {
      importResult = run(process.execPath, ['--input-type=module', '-e', `const mod=await import(${JSON.stringify(consumer.packageName)});if(Object.keys(mod).length===0)process.exit(2)`], consumerRoot);
    }
    if (importResult.status !== 0) {
      fail('UIFN_CONSUMER_IMPORT_FAILED', { framework: consumer.framework, stdout: sanitize(importResult.stdout), stderr: sanitize(importResult.stderr) });
    }

    const installed = new Set(readdirSync(path.join(consumerRoot, 'node_modules')));
    const forbiddenPeers = ['react', 'react-dom', 'svelte', 'solid-js'].filter((peer) => !(peer in consumer.peers));
    for (const peer of forbiddenPeers) {
      if (installed.has(peer)) fail('UIFN_CONSUMER_CROSS_FRAMEWORK_PEER', { framework: consumer.framework, peer });
    }
    results.push({
      framework: consumer.framework,
      package: consumer.packageName,
      peers: Object.keys(consumer.peers),
      publicImport: importResult.status === 0,
      importMode,
      lockSha256: createHash('sha256').update(readFileSync(path.join(consumerRoot, 'package-lock.json'))).digest('hex'),
    });
  }

  const result = {
    ok: failures.length === 0,
    command: 'verify:uifn-consumers',
    graphSha256: createHash('sha256').update(JSON.stringify(graph)).digest('hex'),
    artifactHashes,
    consumers: results,
    failures,
  };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
