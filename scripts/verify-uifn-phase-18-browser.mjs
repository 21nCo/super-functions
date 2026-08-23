#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit, devices } from 'playwright';
import { serveStatic } from './uifn-phase-17-fixtures.mjs';
import { inspectObservedAssertion, sha256, stableJson, validateFailureArtifact } from './uifn-phase-18-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.env.UIFN_PHASE18_BROWSER_EVIDENCE ? path.resolve(process.env.UIFN_PHASE18_BROWSER_EVIDENCE) : null;
const outputRoot = outputPath ? path.dirname(outputPath) : null;
const storyEvidencePath = process.env.UIFN_PHASE18_PHASE17_STORY_EVIDENCE ? path.resolve(process.env.UIFN_PHASE18_PHASE17_STORY_EVIDENCE) : null;
const docsEvidencePath = process.env.UIFN_PHASE18_PHASE17_DOCS_EVIDENCE ? path.resolve(process.env.UIFN_PHASE18_PHASE17_DOCS_EVIDENCE) : null;
const staticRoot = path.resolve(process.env.UIFN_PHASE18_STORYBOOK_STATIC ?? path.join(root, 'uifn/storybook/storybook-static'));
const inventory = JSON.parse(readFileSync(path.join(root, 'uifn/storybook/generated/story-inventory.json'), 'utf8'));
const ledger = JSON.parse(readFileSync(path.join(root, 'uifn/.conduct/generated/phase-18/normative-ledger.json'), 'utf8'));
const axeSource = readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const frameworkRotation = new Map(ledger.primitives.map((entry, index) => [entry.primitive, ['react', 'svelte', 'solid'][index % 3]]));
const twoDimensionalExceptions = new Set(['carousel', 'color-picker', 'data-table', 'image-cropper', 'slider', 'splitter', 'tree-view']);
const browserTypes = { chromium, firefox, webkit };
const matrixFilter = process.env.UIFN_PHASE18_MATRIX_FILTER ? new RegExp(process.env.UIFN_PHASE18_MATRIX_FILTER) : null;
const primitiveFilter = process.env.UIFN_PHASE18_PRIMITIVE_FILTER ? new RegExp(process.env.UIFN_PHASE18_PRIMITIVE_FILTER) : null;
const failures = [];
const startedAt = new Date();

function relativeArtifact(absolute) {
  return path.relative(root, absolute).replaceAll(path.sep, '/');
}

function loadRequiredEvidence(absolute, code) {
  if (!absolute || !existsSync(absolute)) {
    failures.push({ code, reason: 'required-evidence-missing' });
    return null;
  }
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

function inspectPhase17Evidence(story, docs) {
  if (!story || story.status !== 'passed' || story.counts?.storiesExpected !== inventory.storyCount || story.counts?.storiesPassed !== inventory.storyCount) failures.push({ code: 'UIFN_A11Y_STORY_EVIDENCE_INVALID', status: story?.status, actual: story?.counts?.storiesPassed, expected: inventory.storyCount });
  const storyResults = story?.storyResults ?? [];
  const resultIds = new Set(storyResults.map((result) => `${result.framework}:${result.story}`));
  for (const entry of inventory.stories) {
    if (!resultIds.has(`${entry.framework}:${entry.id}`)) failures.push({ code: 'UIFN_A11Y_MODE_UNMAPPED', primitive: entry.primitive, framework: entry.framework, scenario: entry.scenario });
  }
  for (const result of storyResults) {
    if (result.status !== 'passed' || result.axeSeriousCritical?.length) failures.push({ code: 'UIFN_A11Y_STORY_EVIDENCE_INVALID', framework: result.framework, story: result.story });
  }
  const consumers = docs?.consumers ?? [];
  if (!docs || docs.status !== 'passed' || consumers.length !== 6) failures.push({ code: 'UIFN_A11Y_PACKAGE_SOURCE_FIXTURE_INVALID', status: docs?.status, consumers: consumers.length });
  for (const consumer of consumers) {
    const explicit = consumer.browser?.explicitAssertions ?? [];
    if (
      consumer.status !== 'passed'
      || explicit.length !== ledger.primitiveCount
      || explicit.some((assertion) => !assertion.observed || assertion.actualTag !== assertion.expectedTag)
    ) {
      failures.push({ code: 'UIFN_A11Y_PACKAGE_SOURCE_FIXTURE_INVALID', framework: consumer.framework, deliveryMode: consumer.deliveryMode });
    }
    if (consumer.browser?.axeSeriousCritical?.violations?.length) failures.push({ code: 'UIFN_A11Y_AXE_FAILED', framework: consumer.framework, deliveryMode: consumer.deliveryMode });
  }
  return { storyResults, consumers };
}

function inspectStaticBuild(story) {
  const frameworks = {};
  for (const framework of ['react', 'svelte', 'solid']) {
    const indexPath = path.join(staticRoot, framework, 'index.json');
    const assetRoot = path.join(staticRoot, framework, 'assets');
    if (!existsSync(indexPath) || !existsSync(assetRoot)) {
      failures.push({ code: 'UIFN_A11Y_STORYBOOK_BUILD_MISSING', framework });
      continue;
    }
    const indexSha256 = sha256(readFileSync(indexPath));
    const expectedIndexSha256 = story?.indexes?.[framework]?.sha256;
    if (!expectedIndexSha256 || indexSha256 !== expectedIndexSha256) {
      failures.push({ code: 'UIFN_A11Y_STORYBOOK_BUILD_IDENTITY_MISMATCH', framework, expectedIndexSha256, actualIndexSha256: indexSha256 });
    }
    const cssAssets = readdirSync(assetRoot).filter((name) => name.endsWith('.css')).sort().map((name) => {
      const absolute = path.join(assetRoot, name);
      const content = readFileSync(absolute);
      return { path: relativeArtifact(absolute), sha256: sha256(content), content: content.toString('utf8') };
    });
    if (!cssAssets.some((asset) => asset.content.includes('max-inline-size:100%') && asset.content.includes('block-size:auto'))) {
      failures.push({ code: 'UIFN_A11Y_REFLOW_STYLE_MISSING', framework });
    }
    frameworks[framework] = {
      index: { path: relativeArtifact(indexPath), sha256: indexSha256, expectedSha256: expectedIndexSha256 },
      cssAssets: cssAssets.map(({ content: _content, ...asset }) => asset),
    };
  }
  return frameworks;
}

function selectEntries(scenario, allFrameworks) {
  const byKey = new Map();
  for (const entry of inventory.stories) {
    if (entry.scenario !== scenario) continue;
    if (!allFrameworks && frameworkRotation.get(entry.primitive) !== entry.framework) continue;
    byKey.set(`${entry.primitive}:${entry.framework}`, entry);
  }
  for (const primitive of ledger.primitives) {
    const frameworks = allFrameworks ? ['react', 'svelte', 'solid'] : [frameworkRotation.get(primitive.primitive)];
    for (const framework of frameworks) {
      const key = `${primitive.primitive}:${framework}`;
      if (!byKey.has(key)) {
        const fallback = inventory.stories.find((entry) => entry.primitive === primitive.primitive && entry.framework === framework && entry.scenario === 'default');
        if (fallback) byKey.set(key, fallback);
      }
    }
  }
  return [...byKey.values()].filter((entry) => !primitiveFilter || primitiveFilter.test(entry.primitive));
}

const matrix = [
  { id: 'firefox-keyboard-semantics', engine: 'firefox', scenario: 'keyboard-focus', allFrameworks: true },
  { id: 'webkit-keyboard-semantics', engine: 'webkit', scenario: 'keyboard-focus', allFrameworks: true },
  { id: 'chromium-forced-colors', engine: 'chromium', scenario: 'forced-colors', forcedColors: 'active' },
  { id: 'chromium-reduced-motion', engine: 'chromium', scenario: 'reduced-motion', reducedMotion: 'reduce' },
  { id: 'chromium-rtl', engine: 'chromium', scenario: 'rtl' },
  { id: 'chromium-zoom-200', engine: 'chromium', scenario: 'responsive', zoomPercent: 200 },
  { id: 'chromium-zoom-400', engine: 'chromium', scenario: 'responsive', zoomPercent: 400 },
  { id: 'chromium-android-emulation', engine: 'chromium', scenario: 'responsive', device: devices['Pixel 7'], certification: 'emulation-not-device' },
  { id: 'webkit-ios-emulation', engine: 'webkit', scenario: 'responsive', device: devices['iPhone 15'], certification: 'emulation-not-device' },
];

const incompleteReviewPolicy = {
  bypass: {
    disposition: 'reviewed-outside-component-scope',
    releaseBlocking: false,
    rationale: 'Each Storybook iframe intentionally isolates one component and therefore cannot supply application-level bypass navigation. Bypass behavior belongs to the consuming application, not a primitive.',
  },
  'aria-valid-attr-value': {
    disposition: 'reviewed-by-explicit-idref-audit',
    releaseBlocking: false,
    rationale: 'Axe reports that it cannot determine whether dynamic aria-controls targets exist. This verifier independently resolves every ARIA ID reference against the live document and fails UIFN_A11Y_IDREF_MISSING when any target is absent.',
  },
  'color-contrast': {
    disposition: 'reviewed-phase-19-visual-check-required',
    releaseBlocking: true,
    rationale: 'Axe cannot calculate contrast for generated geometry fixtures whose text is overlapped by slider, angle-slider, or signature-pad layers. Phase 19 must visually inspect these named fixtures; Phase 18 remains provisional and cannot support a release claim.',
  },
};

function reviewAxeIncompletes(matrixResults) {
  const grouped = new Map();
  for (const cell of matrixResults) {
    for (const result of cell.results) {
      for (const incomplete of result.axe?.incompletes ?? []) {
        const group = grouped.get(incomplete.id) ?? { id: incomplete.id, impact: incomplete.impact, occurrences: 0, nodes: 0, samples: [] };
        group.occurrences += 1;
        group.nodes += incomplete.nodeCount;
        if (group.samples.length < 12) {
          group.samples.push({
            matrix: result.matrix,
            framework: result.framework,
            primitive: result.primitive,
            story: result.story,
            nodes: incomplete.nodes,
          });
        }
        grouped.set(incomplete.id, group);
      }
    }
  }
  return [...grouped.values()].sort((left, right) => left.id.localeCompare(right.id)).map((group) => {
    const policy = incompleteReviewPolicy[group.id];
    if (!policy) {
      failures.push({ code: 'UIFN_A11Y_AXE_INCOMPLETE_UNREVIEWED', rule: group.id, impact: group.impact, occurrences: group.occurrences });
      return { ...group, disposition: 'unreviewed', releaseBlocking: true, rationale: 'No explicit review policy exists for this axe incomplete.' };
    }
    return { ...group, ...policy };
  });
}

async function captureFailure(page, record, details) {
  if (!outputRoot) return null;
  const slug = `${record.code.toLowerCase()}-${record.primitive}-${record.framework}-${record.matrix}`.replace(/[^a-z0-9_.-]+/g, '-');
  const directory = path.join(outputRoot, 'failures', slug);
  mkdirSync(directory, { recursive: true });
  const screenshotPath = path.join(directory, 'screenshot.png');
  await page.screenshot({ path: screenshotPath, animations: 'disabled' });
  const capturedAt = new Date();
  const artifact = {
    schemaVersion: 1,
    code: record.code,
    primitive: record.primitive,
    framework: record.framework,
    deliveryMode: 'package',
    browser: record.engine,
    version: details.browserVersion,
    sourceHash: ledger.definitionSha256,
    dom: String(details.dom ?? '').slice(0, 20_000).replace(/\/(?:Users|home|private\/var|Volumes)\/[^"'\s<]+/g, '[path]'),
    semanticTrace: details.semanticTrace ?? [],
    eventTrace: details.eventTrace ?? [],
    focusPath: details.focusPath ?? [],
    screenshot: 'screenshot.png',
    capturedAt: capturedAt.toISOString(),
    expiresAt: new Date(capturedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
  writeFileSync(path.join(directory, 'failure.json'), stableJson(artifact));
  return { path: relativeArtifact(path.join(directory, 'failure.json')), artifact, validation: validateFailureArtifact(artifact) };
}

async function inspectStory(page, serverUrl, entry, config, browserVersion) {
  const url = `${serverUrl}/${entry.framework}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story`;
  const runtimeErrors = [];
  const onPageError = (error) => runtimeErrors.push({ type: 'pageerror', message: error.message });
  page.on('pageerror', onPageError);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const marker = page.locator(`[data-uifn-story-id="${entry.primitive}--${entry.scenario}"]`);
    await marker.waitFor({ state: 'attached', timeout: 12_000 });
    const primitiveLedger = ledger.primitives.find((value) => value.primitive === entry.primitive);
    const expectedRoot = primitiveLedger.traceContract.expectedSemanticParts.find((part) => part.part === entry.compoundRootPart && part.instance === 'root')
      ?? primitiveLedger.traceContract.expectedSemanticParts.find((part) => part.part === entry.compoundRootPart);
    const media = await page.evaluate(() => ({
      forcedColors: matchMedia('(forced-colors: active)').matches,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    }));
    const semanticBefore = await marker.evaluate((element, expectedPart) => {
      const nodes = [...document.querySelectorAll(`[data-uifn-component="${element.getAttribute('data-uifn-story-id')?.split('--')[0]}"][data-uifn-part]`)];
      const root = nodes.find((node) => node.getAttribute('data-uifn-part') === expectedPart) ?? nodes[0];
      const focusable = element.querySelector('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [role="slider"], [role="option"], [role="menuitem"], [tabindex]:not([tabindex="-1"])');
      const name = focusable ? (focusable.getAttribute('aria-label') || (focusable.getAttribute('aria-labelledby') ? focusable.getAttribute('aria-labelledby').split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim() : '') || focusable.getAttribute('title') || focusable.textContent?.trim() || '') : null;
      const parts = nodes.map((node) => ({
        part: node.getAttribute('data-uifn-part'),
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute('role'),
        aria: [...node.attributes].filter((attribute) => attribute.name.startsWith('aria-')).map((attribute) => [attribute.name, attribute.value]).sort(),
        data: [...node.attributes].filter((attribute) => attribute.name.startsWith('data-') && !['data-uifn-component', 'data-uifn-part'].includes(attribute.name)).map((attribute) => [attribute.name, attribute.value]).sort(),
      })).sort((left, right) => `${left.part}:${left.tag}`.localeCompare(`${right.part}:${right.tag}`));
      const idReferences = [...document.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby], [aria-owns], [aria-activedescendant]')].flatMap((node) =>
        ['aria-controls', 'aria-labelledby', 'aria-describedby', 'aria-owns', 'aria-activedescendant'].flatMap((attribute) => {
          const value = node.getAttribute(attribute);
          if (!value) return [];
          return value.trim().split(/\s+/).map((id) => ({
            sourcePart: node.getAttribute('data-uifn-part'),
            attribute,
            id,
            exists: Boolean(document.getElementById(id)),
          }));
        }),
      );
      return {
        root: root ? { tag: root.tagName.toLowerCase(), part: root.getAttribute('data-uifn-part'), role: root.getAttribute('role') } : null,
        parts,
        focusable: focusable ? { part: focusable.getAttribute('data-uifn-part'), tag: focusable.tagName.toLowerCase(), role: focusable.getAttribute('role'), name } : null,
        direction: getComputedStyle(element).direction,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        idReferences,
        dom: element.outerHTML.slice(0, 20_000),
      };
    }, entry.compoundRootPart);
    const beforeSha256 = sha256(stableJson(semanticBefore.parts));
    const focusPath = [];
    const eventTrace = [];
    const target = marker.locator('button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [role="slider"], [role="option"], [role="menuitem"], [tabindex]:not([tabindex="-1"])').first();
    const transitionHashes = [beforeSha256];
    if (await target.count()) {
      await target.focus();
      focusPath.push(await page.evaluate(() => document.activeElement?.getAttribute('data-uifn-part') ?? document.activeElement?.tagName.toLowerCase() ?? null));
      for (const action of [{ type: 'click' }, { type: 'key', value: 'ArrowDown' }, { type: 'key', value: 'ArrowRight' }, { type: 'key', value: ' ' }, { type: 'key', value: 'Enter' }]) {
        try {
          if (action.type === 'click') await target.click({ timeout: 2_000 });
          else await target.press(action.value, { timeout: 2_000 });
          await page.waitForTimeout(10);
          const state = await marker.evaluate((element) => [...document.querySelectorAll(`[data-uifn-component="${element.getAttribute('data-uifn-story-id')?.split('--')[0]}"][data-uifn-part]`)].map((node) => ({
            part: node.getAttribute('data-uifn-part'),
            role: node.getAttribute('role'),
            aria: [...node.attributes].filter((attribute) => attribute.name.startsWith('aria-')).map((attribute) => [attribute.name, attribute.value]).sort(),
            data: [...node.attributes].filter((attribute) => attribute.name.startsWith('data-') && !['data-uifn-component', 'data-uifn-part'].includes(attribute.name)).map((attribute) => [attribute.name, attribute.value]).sort(),
          })));
          const stateHash = sha256(stableJson(state));
          transitionHashes.push(stateHash);
          eventTrace.push({ action, stateHash });
          focusPath.push(await page.evaluate(() => document.activeElement?.getAttribute('data-uifn-part') ?? document.activeElement?.tagName.toLowerCase() ?? null));
        } catch (error) {
          eventTrace.push({ action, error: error instanceof Error ? error.message.slice(0, 240) : String(error) });
        }
      }
    }
    const afterSha256 = transitionHashes.find((hash) => hash !== beforeSha256) ?? transitionHashes.at(-1);
    const transitionExpected = primitiveLedger.traceContract.observedActions.length > 0 && entry.scenario === 'keyboard-focus' && Boolean(semanticBefore.focusable);
    const assertion = {
      id: `${entry.primitive}-${config.id}`,
      kind: primitiveLedger.focus.includes('containment-when-modal') ? 'focus-containment' : 'semantic-transition',
      observed: true,
      requiresTransition: transitionExpected,
      beforeSha256,
      afterSha256,
      focusBefore: focusPath[0] ?? null,
      focusAfter: focusPath.at(-1) ?? null,
      durationMs: 1,
      syntheticAutoPass: false,
    };
    const assertionFailure = inspectObservedAssertion(assertion);
    const axe = await page.evaluate(async () => {
      const report = await globalThis.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return {
        seriousCritical: report.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html.slice(0, 400), failureSummary: node.failureSummary?.slice(0, 600) })),
        })),
        incompletes: report.incomplete.map((item) => ({
          id: item.id,
          impact: item.impact,
          nodeCount: item.nodes.length,
          nodes: item.nodes.slice(0, 5).map((node) => ({
            target: node.target,
            html: node.html.slice(0, 600),
            failureSummary: node.failureSummary?.slice(0, 1_000),
          })),
        })),
      };
    });
    const explicitFailures = [];
    if (!semanticBefore.root || (expectedRoot?.tags?.length && !expectedRoot.tags.includes(semanticBefore.root.tag))) explicitFailures.push({ code: 'UIFN_A11Y_ROLE_STATE_MISSING', reason: 'root-semantic-contract', expectedRoot, actual: semanticBefore.root });
    if (semanticBefore.focusable && !semanticBefore.focusable.name && ['button', 'a', 'input', 'select', 'textarea'].includes(semanticBefore.focusable.tag)) explicitFailures.push({ code: 'UIFN_A11Y_NAME_MISSING', target: semanticBefore.focusable });
    const unresolvedIdReferences = semanticBefore.idReferences.filter((reference) => !reference.exists);
    if (unresolvedIdReferences.length) explicitFailures.push({ code: 'UIFN_A11Y_IDREF_MISSING', references: unresolvedIdReferences });
    if (config.scenario === 'rtl' && semanticBefore.direction !== 'rtl') explicitFailures.push({ code: 'UIFN_A11Y_RTL_FAILED', actual: semanticBefore.direction });
    if (config.forcedColors === 'active' && !media.forcedColors) explicitFailures.push({ code: 'UIFN_A11Y_FORCED_COLORS_FAILED' });
    if (config.reducedMotion === 'reduce' && !media.reducedMotion) explicitFailures.push({ code: 'UIFN_A11Y_REDUCED_MOTION_FAILED' });
    if (config.zoomPercent && semanticBefore.overflow > 1 && !twoDimensionalExceptions.has(entry.primitive)) explicitFailures.push({ code: 'UIFN_A11Y_REFLOW_FAILED', overflow: semanticBefore.overflow, zoomPercent: config.zoomPercent });
    if (assertionFailure) explicitFailures.push(assertionFailure);
    if (runtimeErrors.length) explicitFailures.push({ code: 'UIFN_A11Y_BROWSER_RUNTIME_FAILED', errors: runtimeErrors });
    if (axe.seriousCritical.length) explicitFailures.push({ code: 'UIFN_A11Y_AXE_FAILED', violations: axe.seriousCritical });
    const result = {
      matrix: config.id,
      engine: config.engine,
      browserVersion,
      framework: entry.framework,
      primitive: entry.primitive,
      story: entry.id,
      scenario: entry.scenario,
      status: explicitFailures.length ? 'failed' : 'passed',
      assertion,
      semantic: { ...semanticBefore, dom: undefined },
      axe,
      errors: explicitFailures,
    };
    if (explicitFailures.length) {
      const failure = { code: explicitFailures[0].code, primitive: entry.primitive, framework: entry.framework, matrix: config.id, engine: config.engine, errors: explicitFailures };
      failures.push(failure);
      result.failureArtifact = await captureFailure(page, failure, { browserVersion, dom: semanticBefore.dom, semanticTrace: semanticBefore.parts, eventTrace, focusPath });
    }
    return result;
  } finally {
    page.off('pageerror', onPageError);
  }
}

async function runMatrix(serverUrl, config) {
  const launch = browserTypes[config.engine];
  const browser = await launch.launch({ headless: true });
  const browserVersion = browser.version();
  const options = {
    viewport: config.zoomPercent
      ? { width: Math.round(1280 / (config.zoomPercent / 100)), height: 900 }
      : { width: 1280, height: 900 },
    forcedColors: config.forcedColors,
    reducedMotion: config.reducedMotion,
    ...(config.device ?? {}),
  };
  const context = await browser.newContext(options);
  await context.addInitScript({ content: axeSource });
  const entries = selectEntries(config.scenario, config.allFrameworks === true);
  const queue = [...entries];
  const results = [];
  // Playwright WebKit can deadlock its macOS WebContent processes when a
  // Storybook matrix opens multiple axe-enabled pages concurrently. Serialize
  // that engine while retaining wider parallelism for Chromium and Firefox.
  const workerCount = Math.min(config.engine === 'webkit' ? 1 : 12, entries.length);
  try {
    await Promise.all(Array.from({ length: workerCount }, async () => {
      const page = await context.newPage();
      try {
        while (queue.length) {
          const entry = queue.shift();
          try {
            results.push(await inspectStory(page, serverUrl, entry, config, browserVersion));
          } catch (error) {
            const failure = { code: 'UIFN_A11Y_BROWSER_FAILED', primitive: entry.primitive, framework: entry.framework, matrix: config.id, engine: config.engine, errors: [{ message: error instanceof Error ? error.stack : String(error) }] };
            failures.push(failure);
            results.push({ matrix: config.id, engine: config.engine, browserVersion, framework: entry.framework, primitive: entry.primitive, story: entry.id, scenario: entry.scenario, status: 'failed', errors: failure.errors, failureArtifact: await captureFailure(page, failure, { browserVersion, dom: await page.locator('body').innerHTML().catch(() => ''), semanticTrace: [], eventTrace: [], focusPath: [] }) });
          }
        }
      } finally {
        await page.close();
      }
    }));
  } finally {
    await context.close();
    await browser.close();
  }
  return { ...config, browserVersion, expected: entries.length, executed: results.length, passed: results.filter((result) => result.status === 'passed').length, failed: results.filter((result) => result.status === 'failed').length, results: results.sort((left, right) => `${left.framework}:${left.primitive}`.localeCompare(`${right.framework}:${right.primitive}`)) };
}

async function createFocusMutationArtifact(serverUrl) {
  if (!outputRoot) return null;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  try {
    await page.goto(`${serverUrl}/react/iframe.html?id=stable-dialog--keyboard-focus&viewMode=story`, { waitUntil: 'domcontentloaded' });
    const marker = page.locator('[data-uifn-story-id="dialog--keyboard-focus"]');
    await marker.waitFor({ state: 'attached' });
    const mutation = await marker.evaluate((element) => {
      const content = document.querySelector('[data-uifn-component="dialog"][data-uifn-part="content"]');
      if (content) content.replaceWith(content.cloneNode(true));
      const outside = document.createElement('button');
      outside.textContent = 'outside mutation target';
      outside.setAttribute('data-uifn-mutation-target', 'outside');
      document.body.append(outside);
      outside.focus();
      return {
        dom: element.outerHTML.slice(0, 20_000),
        focusPath: ['dialog-content', document.activeElement?.getAttribute('data-uifn-mutation-target') ?? null],
        eventTrace: [{ mutation: 'replace-dialog-content-with-listener-free-clone' }, { action: 'focus-outside' }],
      };
    });
    const capturedAt = new Date();
    const directory = path.join(outputRoot, 'mutation-artifacts', 'dialog-focus-trap-removed');
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, 'screenshot.png'), animations: 'disabled' });
    const artifact = {
      schemaVersion: 1,
      code: 'UIFN_A11Y_FOCUS_ESCAPE',
      primitive: 'dialog',
      framework: 'react',
      deliveryMode: 'package',
      browser: 'chromium',
      version: browser.version(),
      sourceHash: ledger.definitionSha256,
      dom: mutation.dom,
      semanticTrace: [{ mutation: 'focus-containment-removed', observed: true }],
      eventTrace: mutation.eventTrace,
      focusPath: mutation.focusPath,
      screenshot: 'screenshot.png',
      capturedAt: capturedAt.toISOString(),
      expiresAt: new Date(capturedAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    writeFileSync(path.join(directory, 'failure.json'), stableJson(artifact));
    const validation = validateFailureArtifact(artifact);
    if (validation.length) failures.push(...validation);
    return { code: artifact.code, status: 'mutation-detected', path: relativeArtifact(path.join(directory, 'failure.json')), validation };
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

let result;
const storyEvidence = loadRequiredEvidence(storyEvidencePath, 'UIFN_A11Y_STORY_EVIDENCE_MISSING');
const docsEvidence = loadRequiredEvidence(docsEvidencePath, 'UIFN_A11Y_DOCS_EVIDENCE_MISSING');
const upstream = inspectPhase17Evidence(storyEvidence, docsEvidence);
if (!existsSync(staticRoot)) failures.push({ code: 'UIFN_A11Y_STORYBOOK_BUILD_MISSING' });
const staticBuild = existsSync(staticRoot) ? inspectStaticBuild(storyEvidence) : {};
if (!outputPath) failures.push({ code: 'UIFN_A11Y_EVIDENCE_PATH_MISSING' });

if (existsSync(staticRoot) && outputPath) {
  const server = await serveStatic(staticRoot);
  const matrixResults = [];
  try {
    for (const config of matrix.filter((entry) => !matrixFilter || matrixFilter.test(entry.id))) {
      console.error(`[uifn-phase18-browser] ${config.id}`);
      matrixResults.push(await runMatrix(server.url, config));
    }
    const mutationArtifact = await createFocusMutationArtifact(server.url);
    const incompleteReviews = reviewAxeIncompletes(matrixResults);
    const completedAt = new Date();
    result = {
      schemaVersion: 1,
      phase: 'PHASE_18',
      requirementIds: ['A11Y-001', 'A11Y-002'],
      vectorIds: ['TV-A11Y-001-P', 'TV-A11Y-002-P', 'TV-A11Y-001-N', 'TV-A11Y-002-N'],
      status: failures.length ? 'failed' : 'passed',
      provisionalUntil: ['signed-external-phase-14-compatibility', 'signed-phase-19-assistive-technology', 'independent-phase-19-review'],
      source: { definitionSha256: ledger.definitionSha256 },
      timing: { startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime() },
      counts: {
        phase17Stories: upstream.storyResults.length,
        packageSourceConsumers: upstream.consumers.length,
        matrixCells: matrixResults.length,
        browserAssertions: matrixResults.reduce((count, cell) => count + cell.executed, 0),
        passed: matrixResults.reduce((count, cell) => count + cell.passed, 0),
        failed: matrixResults.reduce((count, cell) => count + cell.failed, 0),
        axeSeriousCritical: matrixResults.reduce((count, cell) => count + cell.results.reduce((total, entry) => total + (entry.axe?.seriousCritical?.length ?? 0), 0), 0),
        axeIncomplete: incompleteReviews.reduce((count, entry) => count + entry.occurrences, 0),
        axeIncompleteReviewed: incompleteReviews.filter((entry) => entry.disposition !== 'unreviewed').reduce((count, entry) => count + entry.occurrences, 0),
      },
      upstreamEvidence: {
        story: { path: relativeArtifact(storyEvidencePath), sha256: sha256(readFileSync(storyEvidencePath)) },
        docs: { path: relativeArtifact(docsEvidencePath), sha256: sha256(readFileSync(docsEvidencePath)) },
      },
      staticBuild,
      incompleteReviews,
      matrix: matrixResults,
      mutationArtifact,
      failures,
    };
  } finally {
    await server.close();
  }
} else {
  const completedAt = new Date();
  result = { schemaVersion: 1, phase: 'PHASE_18', status: 'failed', timing: { startedAt: startedAt.toISOString(), completedAt: completedAt.toISOString(), durationMs: completedAt.getTime() - startedAt.getTime() }, failures };
}

if (outputPath) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, stableJson(result));
}
const summary = { ok: result.status === 'passed', status: result.status, counts: result.counts, failureCount: failures.length, failures: failures.slice(0, 30), evidence: outputPath ? relativeArtifact(outputPath) : null };
(failures.length ? console.error : console.log)(stableJson(summary));
if (failures.length) process.exitCode = 1;
