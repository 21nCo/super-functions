#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const scopeIndex = args.indexOf('--scope');
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'all';
const failures = [];
const frameworks = ['react', 'svelte', 'solid'];

function readJson(pathname) {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8'));
}

function tail(value) {
  return String(value).split('\n').slice(-18).join('\n').trim();
}

function runRenderedA11yMatrix() {
  const result = spawnSync(
    'npm',
    [
      '--workspace',
      '@uifn/components',
      'run',
      'test',
      '--',
      'src/__tests__/story-runtime.test.ts',
      '--testNamePattern',
      'rendered a11y matrix',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_A11Y_RENDERED_MATRIX_FAILED',
      story: 'components/rendered-a11y-matrix',
      theme: 'all',
      viewport: 'all',
      framework: 'all',
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    });
  }

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: 'npm --workspace @uifn/components run test -- src/__tests__/story-runtime.test.ts --testNamePattern "rendered a11y matrix"',
  };
}

function runBrowserA11yMatrix() {
  const result = spawnSync(
    'npm',
    [
      '--workspace',
      '@uifn/components',
      'run',
      'test',
      '--',
      'src/__tests__/browser-workshop.test.ts',
      '--testNamePattern',
      'generated Storybook browser a11y',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_A11Y_BROWSER_MATRIX_FAILED',
      story: 'components/generated-storybook-browser-a11y',
      theme: 'all',
      viewport: 'desktop',
      framework: 'all',
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    });
  }

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: 'npm --workspace @uifn/components run test -- src/__tests__/browser-workshop.test.ts --testNamePattern "generated Storybook browser a11y"',
  };
}

if (scope !== 'batch-b') {
  failures.push({ code: 'UIFN_A11Y_SCOPE_UNSUPPORTED', scope, story: null, theme: null, viewport: null, framework: null });
}

const registryDir = path.join(repoRoot, 'uifn/components/registry/components');
const manifests = readdirSync(registryDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => readJson(`uifn/components/registry/components/${file}`))
  .filter((manifest) => manifest.batch === scope);

for (const manifest of manifests) {
  const fixturePath = `uifn/components/fixtures/${scope}/${manifest.slug}.fixture.json`;
  const storyPath = `uifn/components/stories/${scope}/${manifest.slug}.stories.json`;

  if (!existsSync(path.join(repoRoot, fixturePath)) || !existsSync(path.join(repoRoot, storyPath))) {
    failures.push({
      code: 'UIFN_A11Y_ARTIFACT_MISSING',
      component: manifest.name,
      story: `${manifest.name}/accessibility`,
      theme: 'all',
      viewport: 'all',
      framework: 'all',
    });
    continue;
  }

  const fixture = readJson(fixturePath);
  const story = readJson(storyPath);
  const storyUses = new Set((story.stories ?? []).flatMap((entry) => entry.testUse ?? []));

  if (!fixture.a11y?.keyboard || !fixture.a11y?.focusVisible) {
    failures.push({
      code: 'UIFN_A11Y_KEYBOARD_FOCUS_MISSING',
      component: manifest.name,
      story: `${manifest.name}/keyboard`,
      theme: 'all',
      viewport: 'all',
      framework: 'all',
    });
  }

  if (!storyUses.has('a11y')) {
    failures.push({
      code: 'UIFN_A11Y_STORY_COVERAGE_MISSING',
      component: manifest.name,
      story: `${manifest.name}/accessibility`,
      theme: 'all',
      viewport: 'all',
      framework: 'all',
    });
  }

  if ((manifest.behavior ?? []).includes('portal') && !fixture.a11y?.overlayFocus) {
    failures.push({
      code: 'UIFN_A11Y_OVERLAY_FOCUS_MISSING',
      component: manifest.name,
      story: `${manifest.name}/focus`,
      theme: 'all',
      viewport: 'all',
      framework: 'all',
    });
  }

  if ((manifest.behavior ?? []).includes('form-integration') && !fixture.a11y?.invalidState) {
    failures.push({
      code: 'UIFN_A11Y_INVALID_STATE_MISSING',
      component: manifest.name,
      story: `${manifest.name}/states`,
      theme: 'all',
      viewport: 'all',
      framework: 'all',
    });
  }
}

if (manifests.length !== 26) {
  failures.push({
    code: 'UIFN_A11Y_COMPONENT_COUNT_MISMATCH',
    expected: 26,
    actual: manifests.length,
    story: null,
    theme: null,
    viewport: null,
    framework: null,
  });
}

const renderedMatrix = runRenderedA11yMatrix();
const browserMatrix = runBrowserA11yMatrix();

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-a11y', scope, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-a11y',
      scope,
      componentCount: manifests.length,
      wcag: 'AA',
      frameworks,
      renderedMatrix,
      browserMatrix,
      checks: ['keyboard', 'focus-visible', 'invalid-state', 'overlay-focus', 'story-a11y', 'rendered-dom-aria', 'generated-story-chromium-axe', 'generated-story-chromium-keyboard'],
    },
    null,
    2
  )
);
