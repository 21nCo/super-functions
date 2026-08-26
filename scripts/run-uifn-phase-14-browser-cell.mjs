#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { arch, platform, release, tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { requiredPhase14CompatibilityCells } from './verify-uifn-phase-14-compat.mjs';
import { verifyPhase14FrozenBundle } from './run-uifn-phase-14-node-cell.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameworks = ['react', 'svelte', 'solid'];
const productDefinitions = {
  chrome: { name: 'chrome', product: 'Google Chrome', engine: 'blink', playwrightType: 'chromium', binary: /^(?:Google Chrome(?: for Testing)?)\s+([0-9][0-9.]*)/i, webdriver: /chrome/i },
  firefox: { name: 'firefox', product: 'Mozilla Firefox', engine: 'gecko', playwrightType: 'firefox', binary: /^Mozilla Firefox\s+([0-9][0-9.]*)/i, webdriver: /firefox/i },
  edge: { name: 'edge', product: 'Microsoft Edge', engine: 'blink', playwrightType: 'chromium', binary: /^Microsoft Edge\s+([0-9][0-9.]*)/i, webdriver: /(?:edge|msedge|MicrosoftEdge)/i },
  safari: { name: 'safari', product: 'Safari', engine: 'webkit', webdriver: /safari/i },
  'ios-safari': { name: 'ios-safari', product: 'Mobile Safari', engine: 'webkit', webdriver: /safari/i },
  'android-chrome': { name: 'android-chrome', product: 'Google Chrome', engine: 'blink', webdriver: /chrome/i },
};

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest('hex');
}

function version(value) {
  const match = /([0-9]+(?:\.[0-9]+){0,3})/.exec(String(value ?? ''));
  return match?.[1];
}

export function phase14BrowserCellDefinition(cellId, renderingBrowser = 'chrome') {
  const required = requiredPhase14CompatibilityCells().find((candidate) => candidate.id === cellId);
  if (!required || !['browser', 'device', 'rendering'].includes(required.kind)) throw new Error(`Browser compatibility runner cannot execute ${cellId}.`);
  const browser = required.kind === 'rendering' ? renderingBrowser : required.browser;
  if (!productDefinitions[browser]) throw new Error(`Unsupported real browser product ${browser}.`);
  return { ...required, browser, product: productDefinitions[browser] };
}

export function probePhase14BrowserProduct(cell, rawVersion) {
  const match = cell.product.binary?.exec(String(rawVersion ?? '').trim());
  if (!match) throw new Error(`${cell.id} executable did not identify the exact ${cell.product.product} product: ${String(rawVersion).trim() || '<empty>'}`);
  return { ...cell.product, version: match[1] };
}

export function validatePhase14BrowserDriver(cell, driver) {
  if (!['playwright-product', 'webdriver'].includes(driver)) throw new Error(`Unsupported Phase 14 browser driver ${driver}.`);
  if (cell.kind === 'device' && driver !== 'webdriver') throw new Error(`${cell.id} requires a physical device-lab WebDriver session.`);
  if (['safari', 'ios-safari'].includes(cell.browser) && driver !== 'webdriver') throw new Error(`${cell.id} requires real Safari WebDriver; Playwright WebKit is not evidence.`);
  if (cell.kind === 'rendering' && ['zoom-200', 'zoom-400'].includes(cell.profile) && cell.browser !== 'chrome') {
    throw new Error(`${cell.id} requires an exact Chrome product because page-scale evidence uses the Chrome DevTools protocol.`);
  }
  return true;
}

export function phase14RenderingEmulation(profile) {
  if (!profile) return {};
  if (profile === 'forced-colors' || profile === 'high-contrast') return { media: { forcedColors: 'active' } };
  if (profile === 'reduced-motion') return { media: { reducedMotion: 'reduce' } };
  if (profile === 'theme-light') return { media: { colorScheme: 'light' } };
  if (profile === 'theme-dark') return { media: { colorScheme: 'dark' } };
  if (profile === 'zoom-200') return { pageScaleFactor: 2 };
  if (profile === 'zoom-400') return { pageScaleFactor: 4 };
  if (profile === 'ltr' || profile === 'rtl') return {};
  throw new Error(`Unknown rendering profile ${profile}.`);
}

export function validatePhase14BrowserPayload({ payload, framework, profile, vectors }) {
  const expectedCount = vectors.length;
  if (
    payload?.status !== 'passed'
    || payload.framework !== framework
    || payload.publicTreeCount !== expectedCount
    || !Array.isArray(payload.traces)
    || payload.traces.length !== expectedCount
  ) {
    throw new Error(`${framework} browser payload is incomplete: ${JSON.stringify({ status: payload?.status, framework: payload?.framework, publicTreeCount: payload?.publicTreeCount, message: payload?.message })}`);
  }
  if (payload.warningCount !== 0 || payload.errorCount !== 0) throw new Error(`${framework} browser payload emitted warnings or errors.`);
  const expected = new Map(vectors.map((vector) => [vector.id, vector.primitive]));
  const observed = new Set();
  for (const trace of payload.traces) {
    if (trace.framework !== framework || trace.installMode !== 'package' || trace.result !== 'passed' || expected.get(trace.vectorId) !== trace.primitive || observed.has(trace.vectorId)) {
      throw new Error(`${framework} browser payload contains an invalid or duplicate public-tree trace.`);
    }
    observed.add(trace.vectorId);
  }
  if (observed.size !== expected.size) throw new Error(`${framework} browser payload covered ${observed.size}/${expected.size} exact vectors.`);
  if (profile && (payload.profile !== profile || payload.rendering?.profile !== profile || payload.rendering?.passed !== true)) {
    throw new Error(`${framework} did not prove rendering profile ${profile}.`);
  }
  return true;
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

async function startVite(consumerRoot, { host = '127.0.0.1', publicHost = host } = {}) {
  const require = createRequire(path.join(consumerRoot, 'package.json'));
  const viteEntry = require.resolve('vite');
  const vite = await import(pathToFileURL(viteEntry).href);
  const createServer = vite.createServer ?? vite.default?.createServer;
  if (typeof createServer !== 'function') throw new Error('Frozen browser kit did not expose the Vite server API.');
  const server = await createServer({
    root: consumerRoot,
    configFile: path.join(consumerRoot, 'browser-vite.config.mjs'),
    logLevel: 'error',
    server: { host, port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') throw new Error('Vite browser harness did not expose a TCP address.');
  return { server, baseUrl: `http://${publicHost}:${address.port}` };
}

function appUrl(baseUrl, framework, profile) {
  const url = new URL(baseUrl);
  url.searchParams.set('framework', framework);
  if (profile) url.searchParams.set('profile', profile);
  return url.href;
}

async function collectPlaywright({ cell, consumerRoot, baseUrl, executablePath, headless, timeoutMs }) {
  const rawVersion = run(executablePath, ['--version'], repoRoot).stdout.trim();
  const identity = probePhase14BrowserProduct(cell, rawVersion);
  const require = createRequire(path.join(consumerRoot, 'package.json'));
  const playwright = require('playwright');
  const browserType = playwright[cell.product.playwrightType];
  if (!browserType) throw new Error(`Playwright does not expose ${cell.product.playwrightType}.`);
  const browser = await browserType.launch({ executablePath, headless });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
  const payloads = [];
  try {
    for (const framework of frameworks) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      const emulation = phase14RenderingEmulation(cell.profile);
      if (emulation.media) await page.emulateMedia(emulation.media);
      let cdp;
      if (emulation.pageScaleFactor) {
        if (cell.product.playwrightType !== 'chromium') throw new Error(`${cell.id} page scale requires a Chromium CDP session.`);
        cdp = await context.newCDPSession(page);
      }
      await page.goto(appUrl(baseUrl, framework, cell.profile), { waitUntil: cdp ? 'commit' : 'domcontentloaded', timeout: timeoutMs });
      if (cdp) await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: emulation.pageScaleFactor });
      await page.waitForFunction(() => {
        const result = window.__UIFN_PHASE14_BROWSER_RESULT__;
        return result && result.status !== 'pending';
      }, undefined, { timeout: timeoutMs });
      const payload = await page.evaluate(() => window.__UIFN_PHASE14_BROWSER_RESULT__);
      if (pageErrors.length) throw new Error(`${framework} emitted ${pageErrors.length} page error(s): ${pageErrors.join('; ')}`);
      payloads.push(payload);
      await page.close();
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
  return { identity, payloads, execution: 'playwright-product' };
}

function webdriverEndpoint(value, suffix = '') {
  const url = new URL(value);
  const basePath = url.pathname.replace(/\/$/, '');
  url.pathname = `${basePath}${suffix}`;
  return url;
}

async function webdriverRequest(endpoint, method, suffix, body) {
  const response = await fetch(webdriverEndpoint(endpoint, suffix), {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; } catch { throw new Error(`WebDriver returned non-JSON HTTP ${response.status}.`); }
  if (!response.ok || payload?.value?.error) throw new Error(`WebDriver ${method} ${suffix || '/'} failed: ${JSON.stringify(payload?.value ?? payload)}`);
  return payload.value ?? payload;
}

async function collectWebDriver({ cell, endpoint, capabilities, baseUrl, timeoutMs }) {
  const created = await webdriverRequest(endpoint, 'POST', '/session', { capabilities: { alwaysMatch: capabilities } });
  const sessionId = created.sessionId ?? created['sessionId'];
  const actual = created.capabilities ?? created.value?.capabilities ?? created;
  if (!sessionId) throw new Error('WebDriver did not return a session ID.');
  const actualName = String(actual.browserName ?? actual.browser ?? '');
  if (!cell.product.webdriver.test(actualName)) throw new Error(`${cell.id} WebDriver returned ${actualName || '<missing>'}, not ${cell.product.product}.`);
  const actualVersion = version(actual.browserVersion ?? actual.version);
  if (!actualVersion) throw new Error(`${cell.id} WebDriver did not return an exact browser version.`);
  const payloads = [];
  try {
    for (const framework of frameworks) {
      await webdriverRequest(endpoint, 'POST', `/session/${encodeURIComponent(sessionId)}/url`, { url: appUrl(baseUrl, framework, cell.profile) });
      const started = Date.now();
      let payload;
      while (Date.now() - started < timeoutMs) {
        payload = await webdriverRequest(endpoint, 'POST', `/session/${encodeURIComponent(sessionId)}/execute/sync`, {
          script: 'return window.__UIFN_PHASE14_BROWSER_RESULT__ || null;',
          args: [],
        });
        if (payload?.status && payload.status !== 'pending') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!payload || payload.status === 'pending') throw new Error(`${framework} WebDriver browser harness timed out after ${timeoutMs}ms.`);
      payloads.push(payload);
    }
  } finally {
    await webdriverRequest(endpoint, 'DELETE', `/session/${encodeURIComponent(sessionId)}`).catch(() => undefined);
  }
  return {
    identity: { ...cell.product, version: actualVersion },
    payloads,
    execution: cell.kind === 'device' ? 'device-lab' : 'webdriver',
    sessionId,
    capabilities: actual,
  };
}

function exactOs(actual) {
  if (!actual) return { name: platform(), version: release(), architecture: arch() };
  const name = actual.platformName ?? actual.platform ?? process.env.UIFN_PHASE14_OS_NAME;
  const versionValue = actual.platformVersion ?? actual.os_version ?? process.env.UIFN_PHASE14_OS_VERSION;
  const architecture = actual.architecture ?? actual.arch ?? actual.deviceArchitecture ?? process.env.UIFN_PHASE14_OS_ARCHITECTURE;
  if (!name || !versionValue || !architecture) throw new Error('Remote browser evidence requires exact OS name, version, and architecture capabilities.');
  return { name: String(name), version: String(versionValue), architecture: String(architecture) };
}

async function main() {
  const cellId = requiredArgument('--cell');
  const renderingBrowser = argument('--browser') ?? process.env.UIFN_PHASE14_RENDER_BROWSER ?? 'chrome';
  const cell = phase14BrowserCellDefinition(cellId, renderingBrowser);
  const driver = argument('--driver') ?? process.env.UIFN_PHASE14_BROWSER_DRIVER ?? 'playwright-product';
  validatePhase14BrowserDriver(cell, driver);
  const bundleRoot = path.resolve(requiredArgument('--bundle'));
  const traceRunPath = path.join(bundleRoot, 'trace-run.json');
  if (!existsSync(traceRunPath)) throw new Error(`Frozen trace run is missing: ${traceRunPath}`);
  const traceRun = JSON.parse(readFileSync(traceRunPath, 'utf8'));
  verifyPhase14FrozenBundle(bundleRoot, traceRun);

  const workspace = mkdtempSync(path.join(tmpdir(), `uifn-phase-14-${cellId}-`));
  cpSync(path.join(bundleRoot, 'tarballs'), path.join(workspace, 'tarballs'), { recursive: true });
  cpSync(path.join(bundleRoot, 'consumer-kit'), path.join(workspace, 'consumer-kit'), { recursive: true });
  const consumerRoot = realpathSync(path.join(workspace, 'consumer-kit'));
  for (const file of ['index.html', 'browser-main.ts', 'browser-runtime.ts', 'browser-profile.ts', 'browser-react.ts', 'browser-svelte.ts', 'browser-solid.tsx', 'browser-vite.config.mjs', 'vectors.json']) {
    if (!existsSync(path.join(consumerRoot, file))) throw new Error(`Frozen browser consumer kit is missing ${file}.`);
  }
  const npmPath = process.env.UIFN_NPM_PATH ?? 'npm';
  run(npmPath, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumerRoot, { NPM_CONFIG_CACHE: path.join(workspace, 'npm-cache') });
  const externalBaseUrl = argument('--base-url') ?? process.env.UIFN_PHASE14_APP_BASE_URL;
  const publicHost = process.env.UIFN_PHASE14_PUBLIC_HOST;
  if (cell.kind === 'device' && !externalBaseUrl && !publicHost) throw new Error(`${cell.id} requires an externally reachable --base-url or UIFN_PHASE14_PUBLIC_HOST served from the exact frozen consumer kit.`);
  const local = externalBaseUrl ? undefined : await startVite(consumerRoot, {
    host: publicHost ? '0.0.0.0' : '127.0.0.1',
    publicHost: publicHost ?? '127.0.0.1',
  });
  const baseUrl = externalBaseUrl ?? local.baseUrl;
  const timeoutMs = Number(process.env.UIFN_PHASE14_BROWSER_TIMEOUT_MS ?? 300_000);
  let collected;
  try {
    if (driver === 'playwright-product') {
      const executablePath = argument('--executable') ?? process.env.UIFN_PHASE14_BROWSER_EXECUTABLE;
      if (!executablePath || !existsSync(executablePath)) throw new Error(`${cell.id} requires --executable for the exact installed browser product.`);
      collected = await collectPlaywright({
        cell,
        consumerRoot,
        baseUrl,
        executablePath: path.resolve(executablePath),
        headless: process.env.UIFN_PHASE14_HEADLESS !== '0',
        timeoutMs,
      });
    } else {
      const endpoint = argument('--webdriver-url') ?? process.env.UIFN_PHASE14_WEBDRIVER_URL;
      if (!endpoint) throw new Error(`${cell.id} requires --webdriver-url.`);
      const capabilitiesInput = argument('--webdriver-capabilities') ?? process.env.UIFN_PHASE14_WEBDRIVER_CAPABILITIES ?? '{}';
      const capabilities = JSON.parse(capabilitiesInput);
      collected = await collectWebDriver({ cell, endpoint, capabilities, baseUrl, timeoutMs });
    }
  } finally {
    await local?.server.close().catch(() => undefined);
  }
  const vectors = JSON.parse(readFileSync(path.join(consumerRoot, 'vectors.json'), 'utf8')).vectors;
  for (let index = 0; index < frameworks.length; index += 1) {
    validatePhase14BrowserPayload({ payload: collected.payloads[index], framework: frameworks[index], profile: cell.profile, vectors });
  }
  const raw = {
    cellId,
    identity: {
      name: cell.product.name,
      product: cell.product.product,
      engine: cell.product.engine,
      version: collected.identity.version,
      execution: collected.execution,
    },
    payloads: collected.payloads,
  };
  const resultSha256 = sha256(raw);
  const environment = {
    os: driver === 'webdriver' && process.env.UIFN_PHASE14_WEBDRIVER_LOCAL === 'true'
      ? exactOs()
      : exactOs(collected.capabilities),
    browser: {
      name: cell.product.name,
      product: cell.product.product,
      engine: cell.product.engine,
      channel: cell.channel ?? 'latest',
      version: collected.identity.version,
      execution: collected.execution,
    },
    frameworks,
    ...(cell.kind === 'device' ? {
      device: {
        name: String(collected.capabilities?.deviceName ?? collected.capabilities?.['appium:deviceName'] ?? process.env.UIFN_PHASE14_DEVICE_NAME ?? ''),
        model: String(collected.capabilities?.deviceModel ?? collected.capabilities?.deviceName ?? collected.capabilities?.['appium:deviceName'] ?? process.env.UIFN_PHASE14_DEVICE_MODEL ?? ''),
        osVersion: String(collected.capabilities?.platformVersion ?? collected.capabilities?.os_version ?? process.env.UIFN_PHASE14_DEVICE_OS_VERSION ?? ''),
        physical: process.env.UIFN_PHASE14_DEVICE_PHYSICAL === 'true',
      },
    } : {}),
    ...(cell.kind === 'rendering' ? { rendering: { profile: cell.profile, evidence: collected.payloads.map((payload) => payload.rendering) } } : {}),
  };
  if (cell.kind === 'device' && (!environment.device.name || !environment.device.osVersion || environment.device.physical !== true)) {
    throw new Error(`${cell.id} requires exact physical device name and OS version evidence.`);
  }
  const command = `node scripts/run-uifn-phase-14-browser-cell.mjs --cell ${cellId} --bundle <frozen-bundle> --driver ${driver}`;
  const labSessionUrl = (process.env.UIFN_PHASE14_LAB_SESSION_URL ?? '')
    || (process.env.UIFN_PHASE14_LAB_SESSION_URL_TEMPLATE ?? '').replace('{sessionId}', collected.sessionId ?? '');
  const result = {
    cellId,
    status: 'passed',
    executedAt: new Date().toISOString(),
    command,
    environment,
    observed: {
      passed: true,
      failures: 0,
      publicTreeCount: collected.payloads.reduce((count, payload) => count + payload.publicTreeCount, 0),
      frameworkCount: frameworks.length,
      resultSha256,
    },
    ...(cell.kind === 'device' ? {
      lab: {
        provider: process.env.UIFN_PHASE14_LAB_PROVIDER ?? '',
        sessionId: collected.sessionId,
        sessionUrl: labSessionUrl,
        capabilitiesSha256: sha256(collected.capabilities),
        resultSha256,
      },
    } : {}),
    raw,
  };
  if (cell.kind === 'device' && (!result.lab.provider || !/^https:\/\//.test(result.lab.sessionUrl))) {
    throw new Error(`${cell.id} requires immutable device-lab provider and HTTPS session URL metadata.`);
  }
  const output = path.resolve(requiredArgument('--output'));
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ ...result, raw: { cellId, identity: collected.identity, payloadCount: collected.payloads.length } }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
