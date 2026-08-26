#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  fileSha256, node, npm, packPublicPackages, requirePass, run, serveStatic, sha256, stableJson, write,
} from './uifn-phase-17-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameworks = ['react', 'svelte', 'solid'];
const inventory = JSON.parse(readFileSync(path.join(root, 'uifn/storybook/generated/story-inventory.json'), 'utf8'));
const axeSource = readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const evidencePath = process.env.UIFN_PHASE17_STORY_EVIDENCE ? path.resolve(process.env.UIFN_PHASE17_STORY_EVIDENCE) : null;
const useExisting = process.argv.includes('--use-existing');
const storyFilter = process.env.UIFN_PHASE17_STORY_FILTER ? new RegExp(process.env.UIFN_PHASE17_STORY_FILTER) : null;
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-phase17-storybook-')));

function sanitizeEvidenceText(value) {
  return String(value)
    .replaceAll(workspace, '[temporary-workspace]')
    .replaceAll(root, '[repo-root]')
    .replace(/\/private\/var\/folders\/[^/\s]+\/[^/\s]+\/T\/uifn-phase17-storybook-[^/\s]+/g, '[temporary-workspace]');
}

export function inspectStoryModule(source, { primitive, framework, publicImport }) {
  const failures = [];
  if (!source.includes(`from '${publicImport}'`) && !source.includes(`from "${publicImport}"`)) failures.push({ code: 'UIFN_STORY_NOT_PUBLIC_COMPONENT', primitive, framework, reason: 'public-import-missing' });
  if (!source.includes('StoryHarness') || /component\s*:\s*['"](?:div|span|button)['"]/.test(source) || /render\s*:\s*\(\)\s*=>\s*<div\b/.test(source)) failures.push({ code: 'UIFN_STORY_NOT_PUBLIC_COMPONENT', primitive, framework, reason: 'static-test-double' });
  return failures;
}

export function reconcileStoryIds(expected, actual, framework) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return [
    ...expected.filter((id) => !actualSet.has(id)).map((id) => ({ code: 'UIFN_STORY_MISSING', framework, story: id })),
    ...actual.filter((id) => !expectedSet.has(id)).map((id) => ({ code: 'UIFN_STORY_UNEXPECTED', framework, story: id })),
  ];
}

function storyModulePath(entry) {
  return path.join(root, 'uifn/storybook/workbenches', entry.framework, 'stories', `${entry.primitive}.stories.${entry.framework === 'svelte' ? 'ts' : 'tsx'}`);
}

function fixturePackage(tarballs) {
  const dependencies = Object.fromEntries(Object.entries(tarballs).map(([name, value]) => [name, `file:${value.pathname}`]));
  Object.assign(dependencies, {
    '@storybook/addon-a11y': '10.5.3', '@storybook/addon-docs': '10.5.3',
    '@storybook/react-vite': '10.5.3', '@storybook/svelte-vite': '10.5.3',
    '@sveltejs/vite-plugin-svelte': '6.2.4', react: '18.3.1', 'react-dom': '18.3.1',
    'solid-js': '1.9.13', storybook: '10.5.3', 'storybook-solidjs-vite': '10.6.0',
    svelte: '5.46.4', vite: '7.3.6', 'vite-plugin-solid': '2.11.10', typescript: '5.9.3',
  });
  return { name: 'uifn-phase17-storybook-clean-consumer', private: true, type: 'module', dependencies };
}

function builtStoryIds(index) {
  return Object.values(index.entries).filter((entry) => entry.type === 'story').map((entry) => entry.id).sort();
}

async function exerciseStories(staticRoot) {
  const failures = [];
  const indexes = {};
  const stories = storyFilter
    ? inventory.stories.filter((entry) => storyFilter.test(`${entry.framework}:${entry.id}`))
    : inventory.stories;
  if (storyFilter && stories.length === 0) throw new Error(`UIFN_PHASE17_STORY_FILTER matched no stories: ${storyFilter.source}`);
  for (const framework of frameworks) {
    const pathname = path.join(staticRoot, framework, 'index.json');
    const index = JSON.parse(readFileSync(pathname, 'utf8'));
    const actual = builtStoryIds(index);
    const expected = inventory.stories.filter((entry) => entry.framework === framework).map((entry) => entry.id).sort();
    failures.push(...reconcileStoryIds(expected, actual, framework));
    indexes[framework] = { storyCount: actual.length, docsCount: Object.values(index.entries).filter((entry) => entry.type === 'docs').length, sha256: fileSha256(pathname) };
  }
  if (failures.length) return { failures, indexes, results: [] };

  const server = await serveStatic(staticRoot);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' });
  await context.addInitScript({ content: axeSource });
  await context.addInitScript(() => {
    globalThis.__uifnStoryRuntimeErrors = [];
    globalThis.addEventListener('error', (event) => {
      const error = event.error;
      globalThis.__uifnStoryRuntimeErrors.push({
        message: error?.message ?? event.message,
        code: error?.code,
        details: error?.details,
        stack: error?.stack,
      });
    });
  });
  const results = [];
  let completedStoryCount = 0;
  const progressPath = evidencePath ? `${evidencePath}.progress.json` : null;
  const reportProgress = () => {
    if (completedStoryCount % 100 !== 0 && completedStoryCount !== stories.length) return;
    const summary = {
      schemaVersion: 1,
      phase: 'PHASE_17',
      vector: 'TV-STORY-001-P',
      status: completedStoryCount === inventory.storyCount ? 'traversal-complete' : 'running',
      storiesExpected: stories.length,
      storiesVisited: completedStoryCount,
      storiesPassed: results.filter((entry) => entry.status === 'passed').length,
      failureCount: failures.length,
    };
    console.error(`[uifn-phase17-storybook] visited ${completedStoryCount}/${stories.length}`);
    if (progressPath) write(progressPath, stableJson(summary));
  };
  try {
    // Six axe-enabled pages keep the full catalog sweep stable on CI and local
    // macOS runners; higher concurrency intermittently starves Storybook iframe
    // startup without producing a component/runtime error.
    const workerCount = Math.max(1, Math.min(12, Number(process.env.UIFN_PHASE17_BROWSER_WORKERS ?? 6)));
    const queue = [...stories];
    await Promise.all(Array.from({ length: workerCount }, async () => {
      const page = await context.newPage();
      let storyErrors = [];
      page.on('console', (message) => { if (message.type() === 'error') storyErrors.push({ type: 'console', message: message.text() }); });
      page.on('pageerror', (error) => storyErrors.push({
        type: 'pageerror',
        message: error.message,
        name: error.name,
        stack: error.stack,
      }));
      page.on('requestfailed', (request) => {
        const errorText = request.failure()?.errorText ?? '';
        if (errorText === 'net::ERR_ABORTED') return;
        storyErrors.push({ type: 'requestfailed', message: `${request.method()} ${request.url()} ${errorText}` });
      });
      page.on('response', (response) => { if (response.status() >= 400) storyErrors.push({ type: 'network', message: `${response.status()} ${response.url()}` }); });
      while (queue.length) {
        const entry = queue.shift();
        storyErrors = [];
        const started = Date.now();
        const url = `${server.url}/${entry.framework}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story`;
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
          const marker = page.locator(`[data-uifn-story-id="${entry.primitive}--${entry.scenario}"]`);
          await marker.waitFor({ state: 'attached', timeout: 10_000 });
          const rootPart = marker.locator(`[data-uifn-component="${entry.primitive}"][data-uifn-part="${entry.compoundRootPart}"]`).first();
          await rootPart.waitFor({ state: 'attached', timeout: 5_000 });
          const focusablePart = page.locator(`[data-uifn-component="${entry.primitive}"]:is(button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"]))`).first();
          const interactionTarget = await focusablePart.count() ? focusablePart : rootPart;
          await interactionTarget.evaluate((element) => {
            element.focus();
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
            element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
            element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
          });
          const runtimeErrors = await page.evaluate(() => globalThis.__uifnStoryRuntimeErrors ?? []);
          for (const error of runtimeErrors) {
            if (!storyErrors.some((entry) => entry.type === 'runtime' && entry.stack === error.stack)) {
              storyErrors.push({ type: 'runtime', ...error });
            }
          }
          const semantic = await marker.evaluate((element) => ({
            direction: element.getAttribute('dir'),
            framework: element.getAttribute('data-uifn-story-framework'),
            scenario: element.getAttribute('data-uifn-story-scenario'),
            parts: [...new Set([...document.querySelectorAll(`[data-uifn-component="${element.getAttribute('data-uifn-story-id')?.split('--')[0]}"][data-uifn-part]`)].map((node) => node.getAttribute('data-uifn-part')))].sort(),
            partCount: new Set([...document.querySelectorAll(`[data-uifn-component="${element.getAttribute('data-uifn-story-id')?.split('--')[0]}"][data-uifn-part]`)].map((node) => node.getAttribute('data-uifn-part'))).size,
            rootTag: element.querySelector('[data-uifn-component]')?.tagName.toLowerCase(),
            focusedPart: document.activeElement?.getAttribute('data-uifn-part') ?? null,
          }));
          if (semantic.framework !== entry.framework || semantic.scenario !== entry.scenario) storyErrors.push({ type: 'semantic', message: 'framework/scenario marker mismatch' });
          if (entry.scenario === 'anatomy' && semantic.partCount !== entry.anatomyPartCount) storyErrors.push({ type: 'semantic', message: `anatomy parts ${semantic.partCount}/${entry.anatomyPartCount}` });
          const axe = await page.evaluate(async () => {
            const report = await globalThis.axe.run(document, { resultTypes: ['violations'] });
            return report.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => ({
              id: violation.id,
              impact: violation.impact,
              nodes: violation.nodes.map((node) => ({
                target: node.target,
                html: node.html.slice(0, 400),
                failureSummary: node.failureSummary?.slice(0, 600),
              })),
            }));
          });
          if (axe.length) storyErrors.push({ type: 'a11y', message: JSON.stringify(axe) });
          const screenshot = await page.screenshot({ animations: 'disabled' });
          const record = { framework: entry.framework, story: entry.id, primitive: entry.primitive, scenario: entry.scenario, status: storyErrors.length ? 'failed' : 'passed', durationMs: Date.now() - started, semantic, axeSeriousCritical: axe, visualSha256: sha256(screenshot), errors: storyErrors };
          results.push(record);
          completedStoryCount += 1;
          reportProgress();
          if (storyErrors.length) failures.push({ code: storyErrors.some((error) => error.type === 'a11y') ? 'UIFN_STORY_A11Y_FAILED' : 'UIFN_STORY_BROWSER_FAILED', framework: entry.framework, story: entry.id, errors: storyErrors });
        } catch (error) {
          const errors = [...storyErrors, { type: 'exception', message: error instanceof Error ? error.message : String(error) }];
          results.push({ framework: entry.framework, story: entry.id, primitive: entry.primitive, scenario: entry.scenario, status: 'failed', durationMs: Date.now() - started, errors });
          completedStoryCount += 1;
          reportProgress();
          failures.push({ code: 'UIFN_STORY_BROWSER_FAILED', framework: entry.framework, story: entry.id, errors });
        }
      }
      await page.close();
    }));
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
  return { failures, indexes, results: results.sort((left, right) => `${left.framework}:${left.story}`.localeCompare(`${right.framework}:${right.story}`)) };
}

let finalResult;
try {
  const sourceFailures = [];
  const modules = new Set();
  for (const entry of inventory.stories) {
    const pathname = storyModulePath(entry);
    if (modules.has(pathname)) continue;
    modules.add(pathname);
    sourceFailures.push(...inspectStoryModule(readFileSync(pathname, 'utf8'), entry));
  }

  let staticRoot;
  let tarballs = {};
  const builds = [];
  if (useExisting) {
    staticRoot = path.join(root, 'uifn/storybook/storybook-static');
  } else {
    const tarballRoot = path.join(workspace, 'tarballs');
    tarballs = packPublicPackages(root, tarballRoot);
    const fixtureRoot = path.join(workspace, 'consumer');
    mkdirSync(fixtureRoot, { recursive: true });
    write(path.join(fixtureRoot, 'package.json'), stableJson(fixturePackage(tarballs)));
    const install = run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], fixtureRoot);
    requirePass(install);
    cpSync(path.join(root, 'uifn/storybook/workbenches'), path.join(fixtureRoot, 'workbenches'), { recursive: true });
    staticRoot = path.join(fixtureRoot, 'storybook-static');
    for (const framework of frameworks) {
      const result = run(node, ['node_modules/storybook/dist/bin/dispatcher.js', 'build', '--config-dir', `workbenches/${framework}/.storybook`, '--output-dir', `storybook-static/${framework}`, '--disable-telemetry'], fixtureRoot);
      builds.push({
        framework,
        status: result.ok ? 'passed' : 'failed',
        command: [path.basename(node), ...result.command.split(' ').slice(1)].join(' '),
        stdoutSha256: sha256(result.stdout),
        stderrSha256: sha256(result.stderr),
        outputTail: sanitizeEvidenceText(`${result.stdout}\n${result.stderr}`.split('\n').slice(-30).join('\n')),
      });
      requirePass(result);
    }
  }
  const browser = await exerciseStories(staticRoot);
  const failures = [...sourceFailures, ...browser.failures];
  finalResult = {
    schemaVersion: 1,
    phase: 'PHASE_17',
    vector: 'TV-STORY-001-P',
    status: failures.length ? 'failed' : 'passed',
    cleanPublicPackageBuild: !useExisting,
    counts: { primitives: inventory.primitiveCount, sourceModules: modules.size, storiesExpected: inventory.storyCount, storiesVisited: browser.results.length, storiesPassed: browser.results.filter((entry) => entry.status === 'passed').length },
    tarballs: Object.fromEntries(Object.entries(tarballs).map(([name, value]) => [name, { filename: value.filename, sha256: value.sha256, fileCount: value.fileCount, unpackedSize: value.unpackedSize }])),
    builds,
    indexes: browser.indexes,
    mutationCoverage: [
      { mutation: 'remove-solid-story-export', expected: 'UIFN_STORY_MISSING', observed: reconcileStoryIds(['stable-dialog--default'], [], 'solid')[0]?.code },
      { mutation: 'dialog-static-test-double', expected: 'UIFN_STORY_NOT_PUBLIC_COMPONENT', observed: inspectStoryModule(`const meta={component:'div'};export const Default={render:()=> <div/>};`, { primitive: 'dialog', framework: 'react', publicImport: '@uifn/components-react/dialog' })[0]?.code },
    ],
    storyResults: browser.results,
    failures,
    provisionalUntilSignedPhase14Compatibility: true,
  };
  if (evidencePath) write(evidencePath, stableJson(finalResult));
  const summary = { ok: finalResult.status === 'passed', status: finalResult.status, counts: finalResult.counts, indexes: finalResult.indexes, failureCount: failures.length, failures: failures.slice(0, 20), evidence: evidencePath };
  (failures.length ? console.error : console.log)(stableJson(summary));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  finalResult = { schemaVersion: 1, phase: 'PHASE_17', vector: 'TV-STORY-001-P', status: 'failed', failures: [{ code: 'UIFN_STORY_VERIFIER_CRASH', message: error instanceof Error ? error.stack : String(error) }] };
  if (evidencePath) write(evidencePath, stableJson(finalResult));
  console.error(stableJson(finalResult));
  process.exitCode = 1;
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
