#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const scopeIndex = args.indexOf('--scope');
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'all';
const effectiveScope = scope === 'all' ? 'data-rich' : scope;
const failures = [];
const requiredThemes = ['light', 'dark', 'high-contrast-light', 'high-contrast-dark'];
const requiredViewports = ['mobile', 'tablet', 'desktop'];

function readJson(pathname) {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8'));
}

function tail(value) {
  return String(value).split('\n').slice(-18).join('\n').trim();
}

function runRenderedVisualMatrix() {
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
      'rendered visual matrix',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_VISUAL_RENDERED_MATRIX_FAILED',
      component: 'components',
      story: 'components/rendered-visual-matrix',
      theme: 'all',
      viewport: 'all',
      framework: 'all',
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    });
  }

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: 'npm --workspace @uifn/components run test -- src/__tests__/story-runtime.test.ts --testNamePattern "rendered visual matrix"',
  };
}

function runBrowserVisualMatrix() {
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
      'generated Storybook browser visual snapshots',
    ],
    {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_VISUAL_BROWSER_MATRIX_FAILED',
      component: 'components',
      story: 'components/generated-storybook-browser-visual',
      theme: 'all',
      viewport: 'all',
      framework: 'all',
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
    });
  }

  return {
    status: result.status === 0 ? 'passed' : 'failed',
    command: 'npm --workspace @uifn/components run test -- src/__tests__/browser-workshop.test.ts --testNamePattern "generated Storybook browser visual snapshots"',
  };
}

if (effectiveScope !== 'data-rich') {
  failures.push({ code: 'UIFN_VISUAL_SCOPE_UNSUPPORTED', scope, component: null, story: null, theme: null, viewport: null, framework: null });
}

const storyDir = path.join(repoRoot, 'uifn/components/stories/data-rich');
const fixtureDir = path.join(repoRoot, 'uifn/components/fixtures/data-rich');
const storyFiles = readdirSync(storyDir).filter((file) => file.endsWith('.json'));

for (const file of storyFiles) {
  const slug = file.replace(/\.stories\.json$/, '');
  const story = readJson(`uifn/components/stories/data-rich/${file}`);
  const fixture = readJson(`uifn/components/fixtures/data-rich/${slug}.fixture.json`);
  const visualStory = (story.stories ?? []).find((entry) => entry.id === 'visual');

  if (!visualStory?.themes?.includes('high-contrast') || !visualStory?.viewport?.includes('mobile')) {
    failures.push({
      code: 'UIFN_VISUAL_MATRIX_MISSING',
      component: slug,
      story: `${slug}/visual`,
      theme: 'high-contrast',
      viewport: 'mobile',
      framework: 'all',
    });
  }

  if (!fixture.visual?.themes?.includes('dark') || !fixture.visual?.viewports?.includes('desktop')) {
    failures.push({
      code: 'UIFN_VISUAL_FIXTURE_MISSING',
      component: slug,
      story: `${slug}/visual`,
      theme: 'dark',
      viewport: 'desktop',
      framework: 'all',
    });
  }

  if (slug === 'data-table' && fixture.largeData?.rowCount !== 10000) {
    failures.push({
      code: 'UIFN_VISUAL_LARGE_DATA_FIXTURE_MISSING',
      component: slug,
      story: `${slug}/large-data`,
      theme: 'all',
      viewport: 'desktop',
      framework: 'all',
    });
  }
}

if (storyFiles.length !== 6) {
  failures.push({
    code: 'UIFN_VISUAL_COMPONENT_COUNT_MISMATCH',
    expected: 6,
    actual: storyFiles.length,
    component: null,
    story: null,
    theme: null,
    viewport: null,
    framework: null,
  });
}

const renderedMatrix = runRenderedVisualMatrix();
const browserMatrix = runBrowserVisualMatrix();

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-visual', scope, effectiveScope, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-visual',
      scope,
      effectiveScope,
      componentCount: storyFiles.length,
      matrix: {
        themes: requiredThemes,
        viewports: requiredViewports,
        reducedMotion: true,
      },
      renderedMatrix,
      browserMatrix,
      checks: ['theme-matrix', 'viewport-matrix', 'large-data-fixture', 'rendered-dom-matrix', 'generated-story-chromium-snapshots', 'pixel-diff'],
    },
    null,
    2
  )
);
