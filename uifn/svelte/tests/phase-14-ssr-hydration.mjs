#!/usr/bin/env node

import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createServer as createViteServer } from 'vite';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const root = path.resolve(argument('--root') ?? process.cwd());
const output = argument('--output');
const onlyPrimitive = argument('--primitive');
const installMode = argument('--install-mode') ?? process.env.UIFN_PHASE14_INSTALL_MODE ?? 'source';
if (!output) throw new Error('--output is required.');
if (!['source', 'package'].includes(installMode)) throw new Error('--install-mode MUST be source or package.');

const require = createRequire(import.meta.url);
const frameworkVersion = require('svelte/package.json').version;
const vite = await createViteServer({
  root,
  appType: 'custom',
  logLevel: 'error',
  plugins: [svelte()],
  optimizeDeps: { exclude: ['@uifn/svelte'] },
  ssr: { noExternal: ['@uifn/svelte'] },
  server: { middlewareMode: true, hmr: false },
});
const entry = await vite.ssrLoadModule('/tests/phase-14-ssr-entry.ts');
const allServerTrees = entry.renderPhase14SvelteSsr();
if (!Array.isArray(allServerTrees) || allServerTrees.length !== 69) {
  throw new Error(`Svelte SSR renderer expected 69 public trees; received ${allServerTrees?.length ?? 'invalid'}.`);
}
const serverTrees = onlyPrimitive
  ? allServerTrees.filter((tree) => tree.primitive === onlyPrimitive)
  : allServerTrees;
if (serverTrees.length === 0) throw new Error(`Unknown --primitive ${onlyPrimitive}.`);
const serverTreeByPrimitive = new Map(serverTrees.map((tree) => [tree.primitive, tree]));

const server = createHttpServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
    if (requestUrl.pathname === '/phase-14-image.png') {
      response.statusCode = 200;
      response.setHeader('content-type', 'image/png');
      response.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
      return;
    }
    if (requestUrl.pathname !== '/phase-14') {
      vite.middlewares(request, response);
      return;
    }
    const primitive = requestUrl.searchParams.get('primitive');
    const tree = primitive ? serverTreeByPrimitive.get(primitive) : undefined;
    if (!tree) {
      response.statusCode = 404;
      response.end('Unknown Phase 14 primitive.');
      return;
    }
    const descriptor = JSON.stringify({ primitive }).replaceAll('<', '\\u003c');
    const source = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>uifn Phase 14 Svelte SSR hydration</title></head>
  <body>
    <div id="app">${tree.body}</div>
    <script id="uifn-phase-14-descriptor" type="application/json">${descriptor}</script>
    <script type="module" src="/tests/phase-14-browser-hydrate.ts"></script>
  </body>
</html>`;
    const html = await vite.transformIndexHtml(request.url ?? '/', source);
    response.statusCode = 200;
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(html);
  } catch (cause) {
    vite.ssrFixStacktrace(cause);
    console.error('Svelte SSR hydration render failed.', cause);
    response.statusCode = 500;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end('Internal Server Error');
  }
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Svelte SSR hydration server did not expose a TCP port.');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const observations = [];

try {
  for (const tree of serverTrees) {
    process.stdout.write(`${JSON.stringify({ framework: 'svelte', mode: 'ssr-hydration', primitive: tree.primitive, status: 'running' })}\n`);
    const page = await browser.newPage();
    const browserWarnings = [];
    const browserErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      const diagnostic = { text: message.text(), location: message.location() };
      if (message.type() === 'warning') browserWarnings.push(diagnostic);
      if (message.type() === 'error') browserErrors.push(diagnostic);
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const response = await page.goto(`${origin}/phase-14?primitive=${encodeURIComponent(tree.primitive)}`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    if (!response?.ok()) throw new Error(`${tree.primitive} SSR document returned HTTP ${response?.status() ?? 'none'}.`);
    try {
      await page.waitForFunction(() => Boolean(
        globalThis.__UIFN_PHASE14_RESULT__ && globalThis.__UIFN_PHASE14_RESULT__.status !== 'pending'
      ), undefined, {
        timeout: 30_000,
      });
    } catch (cause) {
      throw new Error(`${tree.primitive} did not publish a terminal hydration result within 30 seconds.`, { cause });
    }
    const result = await page.evaluate(() => globalThis.__UIFN_PHASE14_RESULT__);
    await page.close();
    if (result?.status !== 'passed') {
      throw new Error(`${tree.primitive} SSR hydration failed: ${JSON.stringify(result)}`);
    }
    if (browserWarnings.length > 0 || browserErrors.length > 0 || pageErrors.length > 0) {
      throw new Error(`${tree.primitive} browser diagnostics were not clean: ${JSON.stringify({ browserWarnings, browserErrors, pageErrors })}`);
    }
    observations.push({
      ...result,
      framework: 'svelte',
      frameworkVersion,
      installMode,
      mode: 'ssr-hydration',
      result: 'passed',
    });
    process.stdout.write(`${JSON.stringify({ framework: 'svelte', mode: 'ssr-hydration', primitive: tree.primitive, status: 'passed' })}\n`);
  }
  await writeFile(path.resolve(output), `${JSON.stringify(observations, null, 2)}\n`);
  console.log(JSON.stringify({
    ok: true,
    framework: 'svelte',
    frameworkVersion,
    installMode,
    mode: 'ssr-hydration',
    publicTreeCount: observations.length,
  }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await vite.close();
}
