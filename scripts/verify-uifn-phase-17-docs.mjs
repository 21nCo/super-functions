#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  fileSha256, node, npm, packPublicPackages, requirePass, run, serveStatic, sha256, stableJson, write,
} from './uifn-phase-17-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidencePath = process.env.UIFN_PHASE17_DOCS_EVIDENCE ? path.resolve(process.env.UIFN_PHASE17_DOCS_EVIDENCE) : null;
const catalog = JSON.parse(readFileSync(path.join(root, 'uifn/catalog/generated/catalog.json'), 'utf8'));
const registry = JSON.parse(readFileSync(path.join(root, 'uifn/registry/generated/catalog.json'), 'utf8'));
const coverage = JSON.parse(readFileSync(path.join(root, 'uifn/docs/generated/docs-coverage.json'), 'utf8'));
const sampleManifest = JSON.parse(readFileSync(path.join(root, 'uifn/docs/generated/sample-manifest.json'), 'utf8'));
const axeSource = readFileSync(path.join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const frameworks = ['react', 'svelte', 'solid'];
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-phase17-docs-')));

export function inspectDocsText(source, relativePath = 'docs.md') {
  const failures = [];
  for (const [index, line] of source.split('\n').entries()) {
    if (/\b(?:vue|angular)\b/i.test(line) && !/(?:unsupported|not supported|removed|previous experimental|no longer)/i.test(line)) {
      failures.push({ code: 'UIFN_DOCS_UNSUPPORTED_CLAIM', path: relativePath, line: index + 1 });
    }
    if (/\b(?:StateMachine|createMachine)\b/.test(line) && !/\b(?:removed|legacy|no public replacement|do not use)\b/i.test(line)) {
      failures.push({ code: 'UIFN_DOCS_REMOVED_API', path: relativePath, line: index + 1 });
    }
    if (/\/(?:Users|tmp|private|home|workspace|var|opt|Volumes)\//.test(line)) failures.push({ code: 'UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', path: relativePath, line: index + 1 });
  }
  return failures;
}

function walk(relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const child = path.join(relative, name);
    if (child.includes('/node_modules/') || child.includes('/dist/') || child.includes('/storybook-static/') || child.includes('/.conduct/')) return [];
    return statSync(path.join(root, child)).isDirectory() ? walk(child) : [child];
  });
}

function inspectCoverage() {
  const failures = [];
  const expectedPrimitiveCount = catalog.primitives.length;
  const expectedSectionCount = catalog.primitives.reduce(
    (count, primitive) => count + primitive.docs.requiredSections.length,
    0,
  );
  const expectedSampleCount = expectedPrimitiveCount * frameworks.length * 2;
  if (
    coverage.primitiveCount !== expectedPrimitiveCount
    || coverage.pages.length !== expectedPrimitiveCount
  ) {
    failures.push({
      code: 'UIFN_DOCS_COVERAGE_MISSING',
      reason: 'primitive-count',
      actual: coverage.pages.length,
      expected: expectedPrimitiveCount,
    });
  }
  if (coverage.requiredSectionCount !== expectedSectionCount) {
    failures.push({
      code: 'UIFN_DOCS_COVERAGE_MISSING',
      reason: 'section-count',
      actual: coverage.requiredSectionCount,
      expected: expectedSectionCount,
    });
  }
  if (sampleManifest.sampleCount !== expectedSampleCount) {
    failures.push({
      code: 'UIFN_DOCS_SAMPLE_MISSING',
      actual: sampleManifest.sampleCount,
      expected: expectedSampleCount,
    });
  }
  const primitiveById = Object.fromEntries(catalog.primitives.map((primitive) => [primitive.id, primitive]));
  for (const page of coverage.pages) {
    const primitive = primitiveById[page.primitive];
    if (!primitive) { failures.push({ code: 'UIFN_DOCS_COVERAGE_MISSING', primitive: page.primitive }); continue; }
    const required = primitive.docs.requiredSections;
    const missing = required.filter((section) => !page.renderedSections.includes(section) || !page.requiredSections.includes(section));
    if (missing.length) failures.push({ code: 'UIFN_DOCS_COVERAGE_MISSING', primitive: page.primitive, missing });
    const markdown = readFileSync(path.join(root, page.page), 'utf8');
    const html = readFileSync(path.join(root, page.renderedPage), 'utf8');
    if (sha256(markdown) !== page.markdownSha256 || sha256(html) !== page.htmlSha256) failures.push({ code: 'UIFN_DOCS_GENERATED_DRIFT', primitive: page.primitive });
    for (const section of required) {
      if (!html.includes(`id="${section}"`) || !markdown.includes(`<a id="${section}"></a>`)) failures.push({ code: 'UIFN_DOCS_COVERAGE_MISSING', primitive: page.primitive, section });
    }
    const leafCount = page.fieldMappings.length;
    if (leafCount !== page.fieldCount || page.fieldMappings.some((mapping) => !required.includes(mapping.section))) failures.push({ code: 'UIFN_DOCS_FIELD_UNMAPPED', primitive: page.primitive });
    if (!markdown.includes(`Published package version: \`${registry.registryVersion}\``)) failures.push({ code: 'UIFN_DOCS_VERSION_STALE', primitive: page.primitive });
    failures.push(...inspectDocsText(markdown, page.page));
  }
  return failures;
}

function inspectLinks() {
  const failures = [];
  const siteRoot = path.join(root, 'uifn/docs/generated/site');
  for (const relative of walk('uifn/docs/generated/site').filter((value) => value.endsWith('.html'))) {
    const source = readFileSync(path.join(root, relative), 'utf8');
    for (const match of source.matchAll(/href="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|#)/.test(match[1])) continue;
      const [target] = match[1].split('#');
      const resolved = path.resolve(path.dirname(path.join(root, relative)), target);
      if (!resolved.startsWith(siteRoot) || !existsSync(resolved)) failures.push({ code: 'UIFN_DOCS_LINK_BROKEN', path: relative, href: match[1] });
    }
  }
  return failures;
}

function fixtureDependencies(tarballs, framework, deliveryMode) {
  const shared = ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/tokens', '@uifn/theme', '@uifn/recipes', '@uifn/components', `@uifn/${framework}`, '@uifn/registry'];
  if (deliveryMode === 'package') shared.push(`@uifn/components-${framework}`);
  const dependencies = Object.fromEntries(shared.map((name) => [name, `file:${tarballs[name].pathname}`]));
  Object.assign(dependencies, { vite: '7.3.6', typescript: '5.9.3', '@types/node': '20.19.25' });
  if (framework === 'react') Object.assign(dependencies, { react: '18.3.1', 'react-dom': '18.3.1', '@types/react': '18.3.28', '@types/react-dom': '18.3.7' });
  if (framework === 'solid') Object.assign(dependencies, { 'solid-js': '1.9.13', 'vite-plugin-solid': '2.11.10' });
  if (framework === 'svelte') Object.assign(dependencies, { svelte: '5.46.4', '@sveltejs/vite-plugin-svelte': '6.2.4', 'svelte-check': '4.3.4' });
  return dependencies;
}

function appSources(samples, framework) {
  const entries = samples.map((sample) => ({ sample, exportName: `${catalog.primitives.find((primitive) => primitive.id === sample.primitive).name}Example` }));
  if (framework === 'react') {
    const imports = entries.map(({ sample, exportName }, index) => `import { ${exportName} as Example${index} } from './${sample.primitive}.ts';`).join('\n');
    return {
      'browser.ts': `import * as React from 'react';\nimport { createRoot } from 'react-dom/client';\n${imports}\nconst examples = [${entries.map((_, index) => `Example${index}`).join(', ')}];\nfunction App(){return React.createElement('main', null, ...examples.map((Example,index)=>React.createElement('section',{'data-uifn-doc-sample':${JSON.stringify(samples.map((sample) => sample.primitive))}[index],key:index},React.createElement(Example))))}\ncreateRoot(document.querySelector('#app')!).render(React.createElement(App));\n(window as any).__UIFN_DOCS_READY__=true;\n`,
    };
  }
  if (framework === 'solid') {
    const imports = entries.map(({ sample, exportName }, index) => `import { ${exportName} as Example${index} } from './${sample.primitive}.ts';`).join('\n');
    return {
      'browser.tsx': `import { render } from 'solid-js/web';\n${imports}\nconst examples = [${entries.map((_, index) => `Example${index}`).join(', ')}];\nconst slugs=${JSON.stringify(samples.map((sample) => sample.primitive))};\nfunction App(){return <main>{examples.map((Example,index)=><section data-uifn-doc-sample={slugs[index]}><Example /></section>)}</main>}\nrender(App,document.querySelector('#app')!);\n(window as any).__UIFN_DOCS_READY__=true;\n`,
    };
  }
  const imports = samples.map((sample, index) => `import Example${index} from './${sample.primitive}.svelte';`).join('\n  ');
  const markup = samples.map((sample, index) => `<section data-uifn-doc-sample="${sample.primitive}"><Example${index} /></section>`).join('\n');
  return {
    'App.svelte': `<script>\n  ${imports}\n</script>\n<main>\n${markup}\n</main>\n`,
    'browser.js': `import { mount } from 'svelte';\nimport App from './App.svelte';\nmount(App,{target:document.querySelector('#app')});\nwindow.__UIFN_DOCS_READY__=true;\n`,
    'svelte.config.js': `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\nexport default { preprocess: vitePreprocess() };\n`,
  };
}

async function exerciseConsumer({ tarballs, framework, deliveryMode }) {
  const fixtureRoot = path.join(workspace, `${framework}-${deliveryMode}`);
  mkdirSync(fixtureRoot, { recursive: true });
  write(path.join(fixtureRoot, 'package.json'), stableJson({ name: `uifn-phase17-docs-${framework}-${deliveryMode}`, private: true, type: 'module', dependencies: fixtureDependencies(tarballs, framework, deliveryMode) }));
  const install = run(npm, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], fixtureRoot);
  requirePass(install);
  if (deliveryMode === 'source') {
    const slugs = catalog.primitives.map((primitive) => primitive.id);
    const add = run(node, ['node_modules/@uifn/registry/dist/bin.mjs', 'add', ...slugs, '--framework', framework, '--json'], fixtureRoot);
    requirePass(add);
  }
  const samples = sampleManifest.samples.filter((sample) => sample.framework === framework && sample.deliveryMode === deliveryMode);
  for (const sample of samples) write(path.join(fixtureRoot, `${sample.primitive}.${framework === 'svelte' ? 'svelte' : 'ts'}`), sample.code);
  for (const [relative, source] of Object.entries(appSources(samples, framework))) write(path.join(fixtureRoot, relative), source);
  write(path.join(fixtureRoot, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>uifn docs samples</title></head><body><div id="app"></div><script type="module" src="/${framework === 'svelte' ? 'browser.js' : framework === 'solid' ? 'browser.tsx' : 'browser.ts'}"></script></body></html>\n`);
  write(path.join(fixtureRoot, 'tsconfig.json'), stableJson({ compilerOptions: { target: 'ES2022', lib: ['ESNext', 'DOM'], types: ['node'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, noEmit: true, allowJs: true, allowImportingTsExtensions: true, jsx: framework === 'react' ? 'react-jsx' : 'preserve', jsxImportSource: framework === 'solid' ? 'solid-js' : undefined }, include: framework === 'svelte' ? ['*.svelte', '*.js', 'components/**/*.svelte', 'components/**/*.ts'] : framework === 'solid' ? ['*.ts', '*.tsx', 'components/**/*.ts'] : ['*.ts', 'components/**/*.ts'] }));
  if (framework === 'svelte') write(path.join(fixtureRoot, 'vite.config.js'), `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default defineConfig({ plugins:[svelte()] });\n`);
  else if (framework === 'solid') write(path.join(fixtureRoot, 'vite.config.js'), `import { defineConfig } from 'vite';\nimport solid from 'vite-plugin-solid';\nexport default defineConfig({ plugins:[solid()], resolve:{conditions:['solid']} });\n`);
  else write(path.join(fixtureRoot, 'vite.config.js'), `import { defineConfig } from 'vite';\nexport default defineConfig({});\n`);
  const typecheck = framework === 'svelte' ? run('node_modules/.bin/svelte-check', ['--tsconfig', './tsconfig.json'], fixtureRoot) : run('node_modules/.bin/tsc', ['--project', 'tsconfig.json'], fixtureRoot);
  requirePass(typecheck);
  const build = run('node_modules/.bin/vite', ['build'], fixtureRoot);
  requirePass(build);
  const server = await serveStatic(path.join(fixtureRoot, 'dist'));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript({ content: axeSource });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  page.on('pageerror', (error) => errors.push({ type: 'pageerror', message: error.message }));
  page.on('requestfailed', (request) => errors.push({ type: 'requestfailed', message: request.url() }));
  try {
    await page.goto(server.url, { waitUntil: 'networkidle' });
    try {
      await page.waitForFunction(() => globalThis.__UIFN_DOCS_READY__ === true, undefined, { timeout: 20_000 });
    } catch {
      throw new Error(`UIFN_DOCS_SAMPLE_RUNTIME_TIMEOUT ${framework}/${deliveryMode}: ${JSON.stringify(errors)} BODY=${(await page.locator('body').innerHTML()).slice(0, 2000)}`);
    }
    const sampleCount = await page.locator('[data-uifn-doc-sample]').count();
    const componentCount = await page.locator('[data-uifn-component]').count();
    if (sampleCount !== catalog.primitives.length || componentCount !== catalog.primitives.length) {
      errors.push({
        type: 'runtime',
        message: `samples=${sampleCount}, roots=${componentCount}, expected=${catalog.primitives.length}`,
      });
    }
    const explicitAssertions = await page.evaluate((expected) => expected.map((entry) => {
      const section = document.querySelector(`[data-uifn-doc-sample="${entry.primitive}"]`);
      const root = section?.querySelector(`[data-uifn-component="${entry.primitive}"][data-uifn-part="${entry.rootPart}"]`);
      return {
        primitive: entry.primitive,
        observed: Boolean(root),
        expectedTag: entry.rootTag,
        actualTag: root?.tagName.toLowerCase() ?? null,
        component: root?.getAttribute('data-uifn-component') ?? null,
        part: root?.getAttribute('data-uifn-part') ?? null,
        beforeSha256Input: root ? `${root.tagName}:${root.getAttribute('data-uifn-component')}:${root.getAttribute('data-uifn-part')}:${root.getAttribute('role') ?? ''}` : '',
      };
    }), catalog.primitives.map((primitive) => ({ primitive: primitive.id, rootPart: primitive.anatomy[0].id, rootTag: primitive.anatomy[0].element })));
    for (const assertion of explicitAssertions) {
      if (!assertion.observed || assertion.actualTag !== assertion.expectedTag || assertion.component !== assertion.primitive) {
        errors.push({ type: 'explicit-a11y', message: `UIFN_A11Y_SOURCE_PACKAGE_ROOT_MISMATCH ${JSON.stringify(assertion)}` });
      }
    }
    const axeSeriousCritical = await page.evaluate(async () => {
      const report = await globalThis.axe.run(document, { resultTypes: ['violations', 'incomplete'] });
      return {
        violations: report.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical').map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html.slice(0, 400), failureSummary: node.failureSummary?.slice(0, 600) })),
        })),
        incompletes: report.incomplete.map((entry) => ({ id: entry.id, impact: entry.impact, nodeCount: entry.nodes.length })),
      };
    });
    if (axeSeriousCritical.violations.length) errors.push({ type: 'a11y', message: JSON.stringify(axeSeriousCritical.violations) });
    if (errors.length) throw new Error(`UIFN_DOCS_SAMPLE_RUNTIME_FAILED ${framework}/${deliveryMode}: ${JSON.stringify(errors)}`);
    return { framework, deliveryMode, status: 'passed', sampleCount, componentCount, packageLockSha256: fileSha256(path.join(fixtureRoot, 'package-lock.json')), typecheck: { status: 'passed', command: typecheck.command }, build: { status: 'passed', command: build.command, stdoutSha256: sha256(build.stdout) }, browser: { status: 'passed', explicitAssertions, axeSeriousCritical, errors } };
  } finally {
    await page.close();
    await context.close();
    await browser.close();
    await server.close();
  }
}

let result;
try {
  const failures = [...inspectCoverage(), ...inspectLinks()];
  for (const relative of walk('uifn').filter((value) => /\.(?:md|mdx)$/.test(value))) failures.push(...inspectDocsText(readFileSync(path.join(root, relative), 'utf8'), relative));
  for (const sample of sampleManifest.samples) {
    if (sha256(sample.code) !== sample.sha256) failures.push({ code: 'UIFN_DOCS_SAMPLE_DRIFT', sample: sample.id });
    failures.push(...inspectDocsText(sample.code, `sample:${sample.id}`));
  }
  const tarballs = packPublicPackages(root, path.join(workspace, 'tarballs'), [
    '@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/tokens', '@uifn/theme', '@uifn/recipes',
    '@uifn/components', '@uifn/react', '@uifn/svelte', '@uifn/solid', '@uifn/components-react',
    '@uifn/components-svelte', '@uifn/components-solid', '@uifn/registry',
  ]);
  const consumers = [];
  if (!process.argv.includes('--static-only')) {
    const selectedFrameworks = process.env.UIFN_PHASE17_DOCS_FRAMEWORK ? [process.env.UIFN_PHASE17_DOCS_FRAMEWORK] : frameworks;
    const selectedModes = process.env.UIFN_PHASE17_DOCS_MODE ? [process.env.UIFN_PHASE17_DOCS_MODE] : ['package', 'source'];
    for (const framework of selectedFrameworks) for (const deliveryMode of selectedModes) consumers.push(await exerciseConsumer({ tarballs, framework, deliveryMode }));
  }
  const mutations = [
    { mutation: 'vue-support-claim', expected: 'UIFN_DOCS_UNSUPPORTED_CLAIM', observed: inspectDocsText('Supported frameworks: React, Vue, and Solid.', 'support.md')[0]?.code },
    { mutation: 'legacy-state-machine-sample', expected: 'UIFN_DOCS_REMOVED_API', observed: inspectDocsText("import { StateMachine } from '@uifn/core';", 'sample.ts')[0]?.code },
  ];
  if (mutations.some((mutation) => mutation.expected !== mutation.observed)) failures.push({ code: 'UIFN_DOCS_MUTATION_SURVIVED', mutations });
  result = {
    schemaVersion: 1, phase: 'PHASE_17', vector: 'TV-DOCS-001-P', status: failures.length ? 'failed' : 'passed',
    counts: { primitives: coverage.primitiveCount, sections: coverage.requiredSectionCount, mappedFields: coverage.mappedFieldCount, samples: sampleManifest.sampleCount, consumers: consumers.length },
    tarballs: Object.fromEntries(Object.entries(tarballs).map(([name, value]) => [name, { filename: value.filename, sha256: value.sha256, fileCount: value.fileCount }])),
    consumers, mutations, failures, provisionalUntilSignedPhase14Compatibility: true,
  };
  if (evidencePath) write(evidencePath, stableJson(result));
  const summary = { ok: !failures.length, status: result.status, counts: result.counts, mutations, failureCount: failures.length, failures: failures.slice(0, 30), evidence: evidencePath };
  (failures.length ? console.error : console.log)(stableJson(summary));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  result = { schemaVersion: 1, phase: 'PHASE_17', vector: 'TV-DOCS-001-P', status: 'failed', failures: [{ code: 'UIFN_DOCS_VERIFIER_CRASH', message: error instanceof Error ? error.stack : String(error) }] };
  if (evidencePath) write(evidencePath, stableJson(result));
  console.error(stableJson(result));
  process.exitCode = 1;
} finally {
  if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
}
