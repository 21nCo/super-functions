#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const repoRoot = process.cwd();
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-svelte-consumer-')));
const tarballs = path.join(workspace, 'tarballs');
const consumer = path.join(workspace, 'consumer');
const npmCache = path.join(workspace, 'npm-cache');
const nodePath = process.execPath;
const npmPath = path.join(path.dirname(nodePath), 'npm');
const checks = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env, PATH: `${path.dirname(nodePath)}:/usr/bin:/bin` },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const check = {
    command: [path.basename(command), ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-30).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-30).join('\n').trim(),
  };
  checks.push(check);
  if (!check.ok) throw new Error(`${check.command} failed\n${check.stderr || check.stdout}`);
  return result;
}

function pack(packageName) {
  const result = run(npmPath, ['pack', '--workspace', packageName, '--json', '--pack-destination', tarballs], {
    env: { NPM_CONFIG_CACHE: npmCache },
  });
  let parsed;
  for (let index = result.stdout.lastIndexOf('['); index >= 0; index = result.stdout.lastIndexOf('[', index - 1)) {
    try {
      const candidate = JSON.parse(result.stdout.slice(index));
      if (Array.isArray(candidate) && candidate[0]?.filename) {
        parsed = candidate;
        break;
      }
    } catch {
      // npm lifecycle output can precede the final JSON payload.
    }
  }
  if (!parsed) throw new Error(`npm pack did not return JSON for ${packageName}.`);
  return path.join(tarballs, parsed[0].filename);
}

async function load(packagePath) {
  return import(pathToFileURL(packagePath).href);
}

async function verifyMode(mode, vite, sveltePlugin) {
  const source = mode === 'source';
  const alias = source ? [{
    find: '@uifn/svelte/accordion',
    replacement: path.join(repoRoot, 'uifn/svelte/lib/generated/accordion/index.ts'),
  }] : [];
  const baseConfig = {
    root: consumer,
    logLevel: 'error',
    plugins: [sveltePlugin.svelte()],
    resolve: { alias },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: { allow: [consumer, repoRoot] },
    },
    ssr: { noExternal: ['@uifn/svelte', '@uifn/core', '@uifn/dom', '@uifn/adapter-kit'] },
  };

  await vite.build({
    ...baseConfig,
    build: { outDir: path.join(consumer, `dist-${mode}`), emptyOutDir: true },
  });
  checks.push({ command: `vite build (${mode})`, ok: true, status: 0, stdout: '', stderr: '' });

  const server = await vite.createServer(baseConfig);
  const browserResults = [];
  try {
    await server.listen();
    const module = await server.ssrLoadModule('/src/ssr.js');
    const rendered = module.renderApp();
    const ssrIds = [...rendered.body.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    writeFileSync(path.join(consumer, 'index.html'), `<!doctype html><html><head>${rendered.head}</head><body><main id="app">${rendered.body}</main><script type="module" src="/src/client.js"></script></body></html>`);
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP address.');
    const url = `http://127.0.0.1:${address.port}`;
    for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
      const browser = await browserType.launch({ headless: true });
      const page = await browser.newPage();
      const diagnostics = [];
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`);
      });
      page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
      await page.goto(url, { waitUntil: 'networkidle' });
      const clientIds = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id).filter((id) => id !== 'app'));
      await page.getByRole('button', { name: 'First section' }).click();
      const expanded = await page.getByRole('button', { name: 'First section' }).getAttribute('aria-expanded');
      const value = await page.getByTestId('value').textContent();
      browserResults.push({ name, diagnostics, ssrIds, clientIds, expanded, value });
      await browser.close();
    }
    return {
      mode,
      html: rendered.body,
      browserResults,
      ok: browserResults.every((result) => result.diagnostics.length === 0
        && JSON.stringify(result.ssrIds) === JSON.stringify(result.clientIds)
        && result.expanded === 'true'
        && result.value?.includes('one')),
    };
  } finally {
    await server.close();
  }
}

let result;
try {
  mkdirSync(tarballs, { recursive: true });
  mkdirSync(path.join(consumer, 'src'), { recursive: true });
  const packageTarballs = [
    pack('@uifn/adapter-kit'),
    pack('@uifn/core'),
    pack('@uifn/dom'),
    pack('@uifn/svelte'),
  ];
  writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify({ name: 'uifn-svelte-packed-consumer', private: true, type: 'module' }, null, 2)}\n`);
  run(npmPath, [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    ...packageTarballs,
    'svelte@5.46.4',
    'vite@5.4.21',
    '@sveltejs/vite-plugin-svelte@4.0.4',
  ], { cwd: consumer, env: { NPM_CONFIG_CACHE: npmCache } });

  writeFileSync(path.join(consumer, 'src/App.svelte'), `<script lang="ts">
  import { Accordion } from '@uifn/svelte/accordion';
  let { initialValue = [] }: { initialValue?: string[] } = $props();
  let value = $state<string | string[]>(initialValue);
</script>

<Accordion.Root type="multiple" bind:value>
  <Accordion.Item value="one">
    <Accordion.Header value="one">
      <Accordion.Trigger value="one">First section</Accordion.Trigger>
    </Accordion.Header>
    <Accordion.Content value="one">First content</Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
<output data-testid="value">{JSON.stringify(value)}</output>
`);
  writeFileSync(path.join(consumer, 'src/client.js'), `import { hydrate } from 'svelte';\nimport App from './App.svelte';\nhydrate(App, { target: document.querySelector('#app'), props: { initialValue: [] } });\n`);
  writeFileSync(path.join(consumer, 'src/ssr.js'), `import { render } from 'svelte/server';\nimport App from './App.svelte';\nexport const renderApp = () => render(App, { props: { initialValue: [] } });\n`);
  writeFileSync(path.join(consumer, 'index.html'), '<main id="app"></main><script type="module" src="/src/client.js"></script>');

  const vite = await load(path.join(consumer, 'node_modules/vite/dist/node/index.js'));
  const sveltePlugin = await load(path.join(consumer, 'node_modules/@sveltejs/vite-plugin-svelte/src/index.js'));
  const packageMode = await verifyMode('package', vite, sveltePlugin);
  const sourceMode = await verifyMode('source', vite, sveltePlugin);
  const normalized = (html) => html.replace(/svelte-[a-z0-9]+/gi, 'svelte-id');
  const equivalent = normalized(packageMode.html) === normalized(sourceMode.html);
  result = {
    ok: checks.every((check) => check.ok) && packageMode.ok && sourceMode.ok && equivalent,
    command: 'verify-uifn-svelte-consumer',
    requirement: 'SVELTE-001',
    vector: 'TV-SVELTE-001-P',
    packageMode,
    sourceMode,
    equivalent,
    checks,
  };
} catch (error) {
  result = {
    ok: false,
    command: 'verify-uifn-svelte-consumer',
    requirement: 'SVELTE-001',
    vector: 'TV-SVELTE-001-P',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    checks,
  };
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

const evidenceOutput = process.env.UIFN_PHASE12_CONSUMER_OUTPUT;
if (evidenceOutput) {
  mkdirSync(path.dirname(path.resolve(evidenceOutput)), { recursive: true });
  writeFileSync(path.resolve(evidenceOutput), `${JSON.stringify(result, null, 2)}\n`);
}
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
