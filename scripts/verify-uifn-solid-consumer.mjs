#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const repoRoot = process.cwd();
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-solid-consumer-')));
const tarballs = path.join(workspace, 'tarballs');
const consumer = path.join(workspace, 'consumer');
const npmCache = path.join(workspace, 'npm-cache');
const nodePath = process.execPath;
const npmPath = path.join(path.dirname(nodePath), 'npm');
const checks = [];
const artifactHashes = {};

function sanitize(value) {
  return String(value).replaceAll(repoRoot, '[REPO]').replaceAll(workspace, '[TEMP]').split('\n').slice(-30).join('\n').trim();
}

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
    stdout: sanitize(result.stdout),
    stderr: sanitize(result.stderr),
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
      // npm lifecycle output can precede its final JSON result.
    }
  }
  if (!parsed) throw new Error(`npm pack did not return JSON for ${packageName}.`);
  const pathname = path.join(tarballs, parsed[0].filename);
  artifactHashes[packageName] = createHash('sha256').update(readFileSync(pathname)).digest('hex');
  return pathname;
}

async function load(packagePath) {
  return import(pathToFileURL(packagePath).href);
}

function browserSummary(result) {
  return {
    name: result.name,
    diagnostics: result.diagnostics,
    hydratedIdsMatch: result.hydratedIdsMatch,
    expanded: result.expanded,
    value: result.value,
    checked: result.checked,
    formValue: result.formValue,
    portalParent: result.portalParent,
    zeroLeaks: result.zeroLeaks,
  };
}

async function verifyMode(mode, vite, solidPlugin) {
  const source = mode === 'source';
  const aliases = source ? [
    ['@uifn/solid/accordion', 'uifn/solid/src/generated/accordion.tsx'],
    ['@uifn/solid/checkbox', 'uifn/solid/src/generated/checkbox.tsx'],
    ['@uifn/solid/dialog', 'uifn/solid/src/generated/dialog.tsx'],
  ].map(([find, replacement]) => ({ find, replacement: path.join(repoRoot, replacement) })) : [];
  const baseConfig = {
    root: consumer,
    logLevel: 'error',
    resolve: { alias: aliases, conditions: ['solid'] },
    server: {
      host: '127.0.0.1',
      port: 0,
      strictPort: false,
      fs: { allow: [consumer, repoRoot] },
    },
    ssr: { noExternal: ['@uifn/solid', '@uifn/core', '@uifn/dom', '@uifn/adapter-kit'] },
  };
  // vite-plugin-solid's `ssr` option enables paired hydratable transforms. Vite
  // still selects DOM or SSR output per transform request.
  const clientConfig = { ...baseConfig, plugins: [solidPlugin.default({ ssr: true, hot: false })] };
  const ssrConfig = {
    ...baseConfig,
    appType: 'custom',
    plugins: [solidPlugin.default({ ssr: true, hot: false })],
    server: { ...baseConfig.server, middlewareMode: true },
  };

  await vite.build({
    ...clientConfig,
    build: { outDir: path.join(consumer, `dist-${mode}`), emptyOutDir: true },
  });
  checks.push({ command: `vite build (${mode})`, ok: true, status: 0, stdout: '', stderr: '' });

  const ssrServer = await vite.createServer(ssrConfig);
  let rendered;
  try {
    const module = await ssrServer.ssrLoadModule('/src/ssr.tsx');
    rendered = module.renderApp();
  } finally {
    await ssrServer.close();
  }
  const html = rendered.body;
  const ssrIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]).sort();
  writeFileSync(path.join(consumer, 'index.html'), `<!doctype html><html><head>${rendered.head}</head><body><main id="app">${html}</main><script type="module" src="/src/client.tsx"></script></body></html>`);

  const server = await vite.createServer(clientConfig);
  const browserResults = [];
  try {
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP address.');
    const url = `http://127.0.0.1:${address.port}`;

    const browserTypes = process.env.UIFN_PHASE13_QUICK === '1' ? { chromium } : { chromium, firefox, webkit };
    for (const [name, browserType] of Object.entries(browserTypes)) {
      const browser = await browserType.launch({ headless: true });
      const page = await browser.newPage();
      const diagnostics = [];
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type())) diagnostics.push(`${message.type()}: ${message.text()}`);
      });
      page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.stack ?? error.message}`));
      await page.goto(url, { waitUntil: 'networkidle' });
      const clientIds = (await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id).filter((id) => id !== 'app'))).sort();
      const accordionTrigger = page.getByRole('button', { name: 'First section' });
      const triggerCount = await accordionTrigger.count();
      if (triggerCount !== 1) {
        throw new Error(`Expected one hydrated Accordion trigger, received ${triggerCount}. Diagnostics: ${diagnostics.join(' | ')}. Body: ${(await page.locator('body').innerHTML()).slice(0, 4000)}`);
      }
      await accordionTrigger.click();
      const expanded = await accordionTrigger.getAttribute('aria-expanded');
      const value = await page.getByTestId('accordion-value').textContent();
      await page.getByTestId('checkbox-control').click();
      const checked = await page.locator('input[name="terms"]').evaluate((input) => input.checked);
      const formValue = await page.locator('form').evaluate((form) => new FormData(form).get('terms'));
      await page.getByRole('button', { name: 'Open dialog' }).click();
      const portalParent = await page.getByTestId('dialog-portal').evaluate((node) => node.parentElement?.tagName ?? null);
      await page.evaluate(() => globalThis.__uifnDisposeApp?.());
      const zeroLeaks = await page.evaluate(() => [...(globalThis.__uifnSolidBridges ?? [])].every((bridge) => {
        const counters = bridge.getLifecycleCounters();
        return counters.activeControllers === 0
          && counters.registeredElements === 0
          && counters.subscribers === 0
          && counters.domDestroyCount === counters.domGeneration;
      }));
      browserResults.push({
        name,
        diagnostics,
        hydratedIdsMatch: JSON.stringify(ssrIds) === JSON.stringify(clientIds),
        expanded,
        value,
        checked,
        formValue,
        portalParent,
        zeroLeaks,
      });
      await browser.close();
    }
    return {
      mode,
      html,
      browserResults: browserResults.map(browserSummary),
      ok: browserResults.every((entry) => entry.diagnostics.length === 0
        && entry.hydratedIdsMatch
        && entry.expanded === 'true'
        && entry.value === '["one"]'
        && entry.checked === true
        && entry.formValue === 'accepted'
        && entry.portalParent === 'BODY'
        && entry.zeroLeaks),
    };
  } finally {
    await server.close();
  }
}

async function verifyTreeShaking(vite, solidPlugin) {
  writeFileSync(path.join(consumer, 'src/tree-shake.tsx'), `import { Checkbox } from '@uifn/solid';\nexport const TreeShakeProbe = () => <Checkbox.Root><Checkbox.Control>Check</Checkbox.Control></Checkbox.Root>;\n`);
  const output = await vite.build({
    root: consumer,
    logLevel: 'error',
    plugins: [solidPlugin.default({ hot: false })],
    resolve: { conditions: ['solid'] },
    build: {
      write: false,
      minify: false,
      lib: { entry: path.join(consumer, 'src/tree-shake.tsx'), formats: ['es'] },
      rollupOptions: {
        external: ['solid-js', 'solid-js/web', '@uifn/core', '@uifn/dom', '@uifn/adapter-kit'],
      },
    },
  });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap((entry) => entry.output ?? []);
  const code = chunks.filter((chunk) => chunk.type === 'chunk').map((chunk) => chunk.code).join('\n');
  const forbidden = ['createAccordionController', 'createDialogController', 'createSelectController', 'AccordionDefinition', 'DialogDefinition'];
  return {
    ok: code.includes('createCheckboxController') && forbidden.every((token) => !code.includes(token)),
    bytes: Buffer.byteLength(code),
    included: ['createCheckboxController'].filter((token) => code.includes(token)),
    excluded: forbidden.filter((token) => !code.includes(token)),
  };
}

let result;
try {
  mkdirSync(tarballs, { recursive: true });
  mkdirSync(path.join(consumer, 'src'), { recursive: true });
  const packageTarballs = [
    pack('@uifn/adapter-kit'),
    pack('@uifn/core'),
    pack('@uifn/dom'),
    pack('@uifn/solid'),
  ];
  writeFileSync(path.join(consumer, 'package.json'), `${JSON.stringify({ name: 'uifn-solid-packed-consumer', private: true, type: 'module' }, null, 2)}\n`);
  run(npmPath, [
    'install', '--ignore-scripts', '--no-audit', '--no-fund',
    ...packageTarballs,
    'solid-js@1.9.13',
    'vite@5.4.21',
    'vite-plugin-solid@2.11.12',
  ], { cwd: consumer, env: { NPM_CONFIG_CACHE: npmCache } });

  writeFileSync(path.join(consumer, 'src/App.tsx'), `import { createSignal, type JSX } from 'solid-js';
import { Accordion } from '@uifn/solid/accordion';
import { Checkbox } from '@uifn/solid/checkbox';
import { Dialog } from '@uifn/solid/dialog';

function track(bridge: unknown): void {
  if (typeof window === 'undefined') return;
  const global = globalThis as typeof globalThis & { __uifnSolidBridges?: Set<any> };
  (global.__uifnSolidBridges ??= new Set()).add(bridge);
}

export default function App(): JSX.Element {
  const [value, setValue] = createSignal<string[]>([]);
  return <>
    <button type="button" data-testid="dispose-tree" onClick={() => (globalThis as any).__uifnDisposeApp?.()}>Dispose tree</button>
    <form>
        <Accordion.Root type="multiple" items={['one']} value={value()} onValueChange={(next) => setValue(next as string[])} render={(payload) => {
          track(payload.bridge);
          return <div {...payload.props()}>
            <Accordion.Item value="one">
              <Accordion.Header value="one"><Accordion.Trigger value="one">First section</Accordion.Trigger></Accordion.Header>
              <Accordion.Content value="one">First content</Accordion.Content>
            </Accordion.Item>
          </div>;
        }} />
        <output data-testid="accordion-value">{JSON.stringify(value())}</output>
        <Checkbox.Root name="terms" value="accepted" defaultChecked={false} render={(payload) => {
          track(payload.bridge);
          return <label {...payload.props()}>
            <Checkbox.Control data-testid="checkbox-control">Accept terms</Checkbox.Control>
            <Checkbox.HiddenInput />
          </label>;
        }} />
        <Dialog.Root render={(payload) => {
          track(payload.bridge);
          return <div {...payload.props()}>
            <Dialog.Trigger>Open dialog</Dialog.Trigger>
            <Dialog.Portal data-testid="dialog-portal">
              <Dialog.Content><Dialog.Title>Consumer dialog</Dialog.Title><Dialog.Description>Hydrated description</Dialog.Description></Dialog.Content>
            </Dialog.Portal>
          </div>;
        }} />
    </form>
  </>;
}
`);
  writeFileSync(path.join(consumer, 'src/client.tsx'), `import { hydrate } from 'solid-js/web';\nimport App from './App';\n(globalThis as any).__uifnDisposeApp = hydrate(() => <App />, document.querySelector('#app'));\n`);
  writeFileSync(path.join(consumer, 'src/ssr.tsx'), `import { generateHydrationScript, renderToString } from 'solid-js/web';\nimport App from './App';\nexport const renderApp = () => ({ body: renderToString(() => <App />), head: generateHydrationScript() });\n`);
  writeFileSync(path.join(consumer, 'index.html'), '<main id="app"></main><script type="module" src="/src/client.tsx"></script>');

  const vite = await load(path.join(consumer, 'node_modules/vite/dist/node/index.js'));
  const solidPlugin = await load(path.join(consumer, 'node_modules/vite-plugin-solid/dist/esm/index.mjs'));
  const packageMode = await verifyMode('package', vite, solidPlugin);
  const sourceMode = await verifyMode('source', vite, solidPlugin);
  const treeShaking = await verifyTreeShaking(vite, solidPlugin);
  const normalize = (html) => html.replace(/data-hk="[^"]+"/g, 'data-hk="solid-id"');
  const equivalent = normalize(packageMode.html) === normalize(sourceMode.html);
  result = {
    ok: checks.every((check) => check.ok) && packageMode.ok && sourceMode.ok && treeShaking.ok && equivalent,
    command: 'verify-uifn-solid-consumer',
    requirement: 'SOLID-001',
    vector: 'TV-SOLID-001-P',
    solidVersion: '1.9.13',
    browsers: ['chromium', 'firefox', 'webkit'],
    packageMode,
    sourceMode,
    equivalent,
    treeShaking,
    artifactHashes,
    checks,
  };
} catch (error) {
  result = {
    ok: false,
    command: 'verify-uifn-solid-consumer',
    requirement: 'SOLID-001',
    vector: 'TV-SOLID-001-P',
    error: error instanceof Error ? error.stack ?? error.message : String(error),
    artifactHashes,
    checks,
  };
} finally {
  rmSync(workspace, { recursive: true, force: true });
}

const evidenceOutput = process.env.UIFN_PHASE13_CONSUMER_OUTPUT;
if (evidenceOutput) {
  mkdirSync(path.dirname(path.resolve(evidenceOutput)), { recursive: true });
  writeFileSync(path.resolve(evidenceOutput), `${JSON.stringify(result, null, 2)}\n`);
}
console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
