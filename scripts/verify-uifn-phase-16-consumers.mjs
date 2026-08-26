#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reactSolidVite = await import(pathToFileURL(path.join(root, 'node_modules/vite/dist/node/index.js')).href);
const svelteVite = await import(pathToFileURL(path.join(root, 'uifn/svelte/node_modules/vite/dist/node/index.js')).href);
const { svelte } = await import(pathToFileURL(path.join(root, 'uifn/svelte/node_modules/@sveltejs/vite-plugin-svelte/src/index.js')).href);
const { default: solid } = await import(pathToFileURL(path.join(root, 'node_modules/vite-plugin-solid/dist/esm/index.mjs')).href);
const npm = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
const node = process.env.UIFN_NODE_PATH ?? '/opt/homebrew/bin/node';
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-phase16-consumers-')));
const tarballRoot = path.join(workspace, 'tarballs');
const axePath = path.join(root, 'node_modules/axe-core/axe.min.js');
mkdirSync(tarballRoot, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    command: [command, ...args].join(' '),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileSha256(pathname) {
  return sha256(readFileSync(pathname));
}

function stable(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function write(pathname, contents) {
  mkdirSync(path.dirname(pathname), { recursive: true });
  writeFileSync(pathname, contents);
}

const sharedPackages = [
  '@uifn/core',
  '@uifn/dom',
  '@uifn/adapter-kit',
  '@uifn/tokens',
  '@uifn/theme',
  '@uifn/recipes',
  '@uifn/components',
];
const frameworkPackages = {
  react: ['@uifn/react', '@uifn/components-react'],
  svelte: ['@uifn/svelte', '@uifn/components-svelte'],
  solid: ['@uifn/solid', '@uifn/components-solid'],
};
const packages = [...sharedPackages, ...Object.values(frameworkPackages).flat(), '@uifn/registry'];

function frameworkDependencies(framework) {
  if (framework === 'react') return { react: '18.3.1', 'react-dom': '18.3.1', '@types/react': '18.3.28', '@types/react-dom': '18.3.7' };
  if (framework === 'svelte') return { svelte: '5.46.4' };
  return { 'solid-js': '1.9.13' };
}

function sourceSpecifier(framework) {
  return framework === 'svelte'
    ? '../components/uifn/svelte/button/index.ts'
    : `../components/uifn/${framework}/button.ts`;
}

function packageSpecifier(framework) {
  return `@uifn/components-${framework}/button`;
}

function appSources(framework, specifier) {
  if (framework === 'react') {
    return {
      'src/app.js': `import React from 'react';\nimport { ButtonRoot } from '${specifier}';\nexport const App = () => React.createElement(ButtonRoot, { 'aria-label': 'Delivery action' }, 'Action');\n`,
      'src/ssr.js': `import React from 'react';\nimport { renderToString } from 'react-dom/server';\nimport { App } from './app.js';\nexport const renderApp = () => renderToString(React.createElement(App));\n`,
      'src/browser.js': `import React from 'react';\nimport { hydrateRoot } from 'react-dom/client';\nimport { App } from './app.js';\nhydrateRoot(document.querySelector('#app'), React.createElement(App));\nwindow.__UIFN_HYDRATED__ = true;\n`,
      'src/typecheck.ts': `import * as React from 'react';\nimport { ButtonRoot } from '${specifier}';\nexport const value = React.createElement(ButtonRoot, { 'aria-label': 'Delivery action' }, 'Action');\n`,
    };
  }
  if (framework === 'solid') {
    return {
      'src/app.js': `import { createComponent } from 'solid-js';\nimport { ButtonRoot } from '${specifier}';\nexport const App = () => createComponent(ButtonRoot, { 'aria-label': 'Delivery action', get children() { return 'Action'; } });\n`,
      'src/ssr.js': `import { generateHydrationScript, renderToString } from 'solid-js/web';\nimport { App } from './app.js';\nexport const renderApp = () => ({ body: renderToString(App), head: generateHydrationScript() });\n`,
      'src/browser.js': `import { hydrate } from 'solid-js/web';\nimport { App } from './app.js';\nhydrate(App, document.querySelector('#app'));\nwindow.__UIFN_HYDRATED__ = true;\n`,
      'src/typecheck.ts': `import { createComponent } from 'solid-js';\nimport { ButtonRoot } from '${specifier}';\nexport const value = createComponent(ButtonRoot, { 'aria-label': 'Delivery action', children: 'Action' });\n`,
    };
  }
  return {
    'src/App.svelte': `<script>\n  import { ButtonRoot } from '${specifier}';\n</script>\n<ButtonRoot aria-label="Delivery action">Action</ButtonRoot>\n`,
    'src/ssr.js': `import { render } from 'svelte/server';\nimport App from './App.svelte';\nexport const renderApp = () => render(App).body;\n`,
    'src/browser.js': `import { hydrate } from 'svelte';\nimport App from './App.svelte';\nhydrate(App, { target: document.querySelector('#app') });\nwindow.__UIFN_HYDRATED__ = true;\n`,
    'svelte.config.js': `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\nexport default { preprocess: vitePreprocess() };\n`,
  };
}

function typeConfig(framework) {
  return stable({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      skipLibCheck: false,
      allowJs: true,
      allowImportingTsExtensions: true,
      checkJs: false,
      noEmit: true,
      jsx: framework === 'react' ? 'react-jsx' : 'preserve',
      jsxImportSource: framework === 'solid' ? 'solid-js' : undefined,
    },
    include: framework === 'svelte' ? ['src/**/*.svelte', 'src/**/*.js', 'components/**/*.svelte', 'components/**/*.ts'] : ['src/**/*.ts', 'components/**/*.ts'],
  });
}

function snapshotProject(projectRoot) {
  const records = [];
  const walk = (relative = '') => {
    for (const name of readdirSync(path.join(projectRoot, relative)).sort()) {
      if (name === 'node_modules' || name === 'dist') continue;
      const child = path.join(relative, name);
      const absolute = path.join(projectRoot, child);
      // Kept synchronous so before/after hashes are reproducible in the evidence file.
      const actual = readFileOrDirectory(absolute);
      if (actual.directory) walk(child);
      else records.push(`${child}\0${sha256(actual.contents)}`);
    }
  };
  walk();
  return sha256(records.join('\n'));
}

function readFileOrDirectory(pathname) {
  const stats = statSync(pathname);
  return stats.isDirectory() ? { directory: true } : { directory: false, contents: readFileSync(pathname) };
}

async function exerciseConsumer({ framework, mode, tarballs }) {
  const projectRoot = path.join(workspace, `${framework}-${mode}`);
  mkdirSync(projectRoot, { recursive: true });
  const selected = mode === 'package'
    ? [...sharedPackages, ...frameworkPackages[framework]]
    : [...sharedPackages, frameworkPackages[framework][0], '@uifn/registry'];
  const dependencies = Object.fromEntries(selected.map((name) => [name, `file:${tarballs[name].pathname}`]));
  Object.assign(dependencies, frameworkDependencies(framework));
  if (framework === 'svelte') dependencies['@sveltejs/vite-plugin-svelte'] = '7.2.0';
  write(path.join(projectRoot, 'package.json'), stable({ name: `uifn-phase16-${framework}-${mode}`, private: true, type: 'module', dependencies }));
  const install = run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], projectRoot);
  requirePass(install);

  let registryPlan = null;
  let beforeSourceInstallSha256 = null;
  let afterSourceInstallSha256 = null;
  if (mode === 'source') {
    beforeSourceInstallSha256 = snapshotProject(projectRoot);
    const add = run(node, ['node_modules/@uifn/registry/dist/bin.mjs', 'add', 'button', '--framework', framework, '--json'], projectRoot);
    requirePass(add);
    registryPlan = JSON.parse(add.stdout);
    if (!registryPlan.ok || registryPlan.rolledBack) throw new Error(`Source install did not commit: ${add.stdout}`);
    afterSourceInstallSha256 = snapshotProject(projectRoot);
    const installed = framework === 'svelte'
      ? path.join(projectRoot, 'components/uifn/svelte/button/index.ts')
      : path.join(projectRoot, `components/uifn/${framework}/button.ts`);
    const source = readFileSync(installed, 'utf8');
    if (source.includes('/Users/') || source.includes('uifn/registry/generated/templates') || /(?:^|\n)import\s+.*?from\s+['"]\.\.\/\.\.\//.test(source)) {
      throw new Error(`UIFN_REGISTRY_REPOSITORY_LEAK ${framework}: ${installed}`);
    }
  }

  const specifier = mode === 'source' ? sourceSpecifier(framework) : packageSpecifier(framework);
  for (const [relative, contents] of Object.entries(appSources(framework, specifier))) write(path.join(projectRoot, relative), contents);
  write(path.join(projectRoot, 'tsconfig.json'), typeConfig(framework));

  const typecheck = framework === 'svelte'
    ? run(path.join(root, 'node_modules/.bin/svelte-check'), ['--tsconfig', './tsconfig.json'], projectRoot)
    : run(path.join(root, 'node_modules/.bin/tsc'), ['--project', 'tsconfig.json'], projectRoot);
  requirePass(typecheck);

  const vite = framework === 'svelte' ? svelteVite : reactSolidVite;
  const pluginsFor = () => framework === 'svelte' ? [svelte()] : framework === 'solid' ? [solid({ ssr: true, hot: false })] : [];
  const resolve = framework === 'solid' ? { conditions: ['solid'] } : undefined;
  const server = await vite.createServer({ root: projectRoot, logLevel: 'silent', plugins: pluginsFor(), resolve, ssr: { noExternal: [/^@uifn\//] }, server: { host: '127.0.0.1', port: 0 } });
  let browser;
  try {
    await server.listen();
    const ssr = await server.ssrLoadModule('/src/ssr.js');
    const rendered = await ssr.renderApp();
    const ssrHtml = typeof rendered === 'string' ? rendered : rendered.body;
    const ssrHead = typeof rendered === 'string' ? '' : rendered.head ?? '';
    if (!ssrHtml.includes('data-uifn-component="button"') || !ssrHtml.includes('data-uifn-part="root"')) {
      throw new Error(`UIFN_PHASE16_SSR_SEMANTICS_MISSING ${framework}-${mode}: ${ssrHtml}`);
    }
    write(path.join(projectRoot, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>uifn delivery fixture</title>${ssrHead}</head><body><main id="app">${ssrHtml}</main><script type="module" src="/src/browser.js"></script></body></html>\n`);
    const address = server.httpServer?.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const hydrationErrors = [];
    page.on('pageerror', (error) => hydrationErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' || /hydration|did not match|server html/i.test(message.text())) hydrationErrors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => window.__UIFN_HYDRATED__ === true, undefined, { timeout: 15_000 });
    } catch {
      throw new Error(`UIFN_PHASE16_HYDRATION_TIMEOUT ${framework}-${mode}: ${hydrationErrors.join(' | ')} BODY=${(await page.locator('body').innerHTML()).slice(0, 2000)}`);
    }
    const trace = await page.locator('[data-uifn-component="button"][data-uifn-part="root"]').evaluate((element) => ({
      tag: element.tagName.toLowerCase(),
      component: element.getAttribute('data-uifn-component'),
      part: element.getAttribute('data-uifn-part'),
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      className: element.getAttribute('class'),
      text: element.textContent?.trim(),
      disabled: element.hasAttribute('disabled'),
    }));
    await page.addScriptTag({ path: axePath });
    const axe = await page.evaluate(async () => window.axe.run(document, { resultTypes: ['violations'] }));
    const seriousCritical = axe.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact));
    if (hydrationErrors.length) throw new Error(`UIFN_PHASE16_HYDRATION_ERROR ${framework}-${mode}: ${hydrationErrors.join(' | ')}`);
    if (seriousCritical.length) throw new Error(`UIFN_PHASE16_A11Y_ERROR ${framework}-${mode}: ${seriousCritical.map((entry) => entry.id).join(', ')}`);
    if (trace.tag !== 'button' || trace.ariaLabel !== 'Delivery action' || trace.text !== 'Action') throw new Error(`UIFN_PHASE16_TRACE_MISMATCH ${framework}-${mode}: ${JSON.stringify(trace)}`);

    await browser.close();
    browser = null;
    await server.close();
    await vite.build({ root: projectRoot, logLevel: 'silent', plugins: pluginsFor(), resolve, build: { emptyOutDir: true } });

    const lock = mode === 'source' ? JSON.parse(readFileSync(path.join(projectRoot, '.uifn/registry.lock'), 'utf8')) : null;
    return {
      framework,
      mode,
      status: 'passed',
      packageLockSha256: fileSha256(path.join(projectRoot, 'package-lock.json')),
      typecheck: { status: 'passed', command: typecheck.command },
      build: { status: 'passed', output: 'dist' },
      ssr: { status: 'passed', sha256: sha256(ssrHtml), bytes: Buffer.byteLength(ssrHtml) },
      hydration: { status: 'passed', errors: [] },
      browser: { status: 'passed', trace },
      accessibility: { status: 'passed', seriousCritical: [] },
      sourceInstall: mode === 'source' ? {
        beforeSha256: beforeSourceInstallSha256,
        afterSha256: afterSourceInstallSha256,
        written: registryPlan.written,
        lock: {
          schemaVersion: lock.schemaVersion,
          catalogSha256: lock.catalogSha256,
          signatureKeyId: lock.signatureKeyId,
          canonicalVersion: lock.items['component:button'].canonicalVersion,
          generatorVersion: lock.items['component:button'].generatorVersion,
          provenance: lock.items['component:button'].provenance,
        },
      } : null,
    };
  } finally {
    if (browser) await browser.close();
    await server.close().catch(() => {});
  }
}

let result;
try {
  const tarballs = {};
  for (const packageName of packages) {
    const packed = run(npm, ['pack', '--workspace', packageName, '--json', '--pack-destination', tarballRoot]);
    requirePass(packed);
    const metadata = parsePack(packed.stdout);
    const pathname = path.join(tarballRoot, metadata.filename);
    tarballs[packageName] = { pathname, filename: metadata.filename, sha256: fileSha256(pathname), fileCount: metadata.files?.length ?? 0 };
  }

  const consumers = [];
  const selectedFrameworks = process.env.UIFN_PHASE16_FRAMEWORK ? [process.env.UIFN_PHASE16_FRAMEWORK] : ['react', 'svelte', 'solid'];
  const selectedModes = process.env.UIFN_PHASE16_MODE ? [process.env.UIFN_PHASE16_MODE] : ['package', 'source'];
  for (const framework of selectedFrameworks) {
    for (const mode of selectedModes) consumers.push(await exerciseConsumer({ framework, mode, tarballs }));
  }
  const equivalence = selectedFrameworks.filter(() => selectedModes.length === 2).map((framework) => {
    const packageTrace = consumers.find((entry) => entry.framework === framework && entry.mode === 'package').browser.trace;
    const sourceTrace = consumers.find((entry) => entry.framework === framework && entry.mode === 'source').browser.trace;
    return { framework, equivalent: JSON.stringify(packageTrace) === JSON.stringify(sourceTrace), packageTrace, sourceTrace };
  });
  if (equivalence.some((entry) => !entry.equivalent)) throw new Error(`UIFN_PHASE16_PACKAGE_SOURCE_DIVERGENCE ${JSON.stringify(equivalence)}`);

  result = {
    schemaVersion: 1,
    phase: 'PHASE_16',
    vector: 'TV-GEN-001-P',
    status: 'passed',
    tarballs: Object.fromEntries(Object.entries(tarballs).map(([name, value]) => [name, { filename: value.filename, sha256: value.sha256, fileCount: value.fileCount }])),
    consumers,
    equivalence,
  };
  const output = process.env.UIFN_PHASE16_CONSUMER_EVIDENCE;
  if (output) write(path.resolve(output), stable(result));
  console.log(stable({ ok: true, vector: result.vector, consumerCount: consumers.length, equivalence: equivalence.map(({ framework, equivalent }) => ({ framework, equivalent })), evidence: output ? path.resolve(output) : null }));
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
