#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const failures = [];
const frameworks = ['react', 'svelte', 'solid'];
const requiredStates = [
  'loading',
  'empty',
  'error',
  'partial',
  'permission-denied',
  'optimistic',
  'success',
  'degraded-network',
  'unsupported-capability',
];
const expectedPatterns = [
  'auth-panel',
  'api-key-table',
  'session-list',
  'user-profile-card',
  'provider-picker',
  'oauth-connections-panel',
  'webhook-endpoint-table',
  'file-dropzone-panel',
  'upload-progress-list',
  'file-list-panel',
  'quota-usage-panel',
  'billing-plan-cards',
  'subscription-status-panel',
  'invoice-table',
];

const forbiddenBackendImports = [
  'authfn',
  'plugfn',
  'filefn',
  'billfn',
  '@uifn/sf',
  '@superfunctions/auth',
  '@superfunctions/db',
];

function file(pathname) {
  return path.join(repoRoot, pathname);
}

function read(pathname) {
  return readFileSync(file(pathname), 'utf8');
}

function readJson(pathname) {
  return JSON.parse(read(pathname));
}

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function requireFile(pathname, code) {
  if (!existsSync(file(pathname))) {
    fail(code, { path: pathname });
    return false;
  }

  return true;
}

const sourceDir = file('uifn/patterns/src');
for (const entry of readdirSync(sourceDir).filter((name) => name.endsWith('.ts'))) {
  const pathname = `uifn/patterns/src/${entry}`;
  const source = read(pathname);

  for (const forbiddenImport of forbiddenBackendImports) {
    if (source.includes(forbiddenImport)) {
      fail('UIFN_PATTERN_BACKEND_IMPORT_FORBIDDEN', { path: pathname, import: forbiddenImport });
    }
  }
}

for (const slug of expectedPatterns) {
  const manifestPath = `uifn/registry/catalog/patterns/${slug}.json`;
  const fixturePath = `uifn/patterns/fixtures/${slug}.fixture.json`;
  const storyPath = `uifn/patterns/stories/${slug}.stories.json`;

  if (!requireFile(manifestPath, 'UIFN_PATTERN_MANIFEST_MISSING')) {
    continue;
  }

  requireFile(fixturePath, 'UIFN_PATTERN_FIXTURE_MISSING');
  requireFile(storyPath, 'UIFN_PATTERN_STORY_MISSING');

  const manifest = readJson(manifestPath);
  if (manifest.kind !== 'pattern' || manifest.status !== 'beta' || manifest.sourcePolicy !== 'clean-room') {
    fail('UIFN_PATTERN_MANIFEST_INVALID', { slug });
  }

  if (!Array.isArray(manifest.owners) || manifest.owners.length === 0) {
    fail('UIFN_REGISTRY_OWNER_MISSING', { slug });
  }

  if (Array.isArray(manifest.backing) && manifest.backing.length > 0) {
    fail('UIFN_PATTERN_BACKEND_BINDING_FORBIDDEN', { slug, backing: manifest.backing });
  }

  for (const framework of frameworks) {
    const metadata = manifest.frameworks?.[framework];
    if (!metadata?.supported || !metadata.packageImport || !metadata.sourceInstall?.helperFile) {
      fail('UIFN_PATTERN_FRAMEWORK_METADATA_MISSING', { slug, framework });
    }
  }

  for (const state of requiredStates) {
    if (!manifest.states?.includes(state)) {
      fail('UIFN_PATTERN_STATE_MISSING', { slug, state });
    }
  }

  if (!manifest.registry?.sourceInstallable || !manifest.registry.lockKey || !Array.isArray(manifest.registry.files)) {
    fail('UIFN_PATTERN_REGISTRY_METADATA_MISSING', { slug });
  }

  if (!existsSync(file(fixturePath)) || !existsSync(file(storyPath))) {
    continue;
  }

  const fixture = readJson(fixturePath);
  for (const state of requiredStates) {
    if (!fixture.states?.[state]) {
      fail('UIFN_PATTERN_FIXTURE_STATE_MISSING', { slug, state });
    }
  }

  if ((fixture.backendImports ?? []).length > 0) {
    fail('UIFN_PATTERN_BACKEND_IMPORT_FORBIDDEN', { slug, backendImports: fixture.backendImports });
  }

  const story = readJson(storyPath);
  const storyIds = new Set((story.stories ?? []).map((entry) => entry.id));
  for (const state of requiredStates) {
    if (!storyIds.has(state)) {
      fail('UIFN_PATTERN_STORY_STATE_MISSING', { slug, state });
    }
  }

  const interactionStory = (story.stories ?? []).find((entry) => entry.testUse?.includes('interaction'));
  if (!interactionStory?.testUse?.includes('a11y')) {
    fail('UIFN_PATTERN_INTERACTION_A11Y_MISSING', { slug });
  }

  const visualStory = (story.stories ?? []).find((entry) => entry.id === 'visual');
  if (
    !visualStory?.testUse?.includes('visual') ||
    !visualStory.themes?.includes('high-contrast') ||
    !visualStory.viewport?.includes('mobile') ||
    !visualStory.viewport?.includes('desktop')
  ) {
    fail('UIFN_PATTERN_VISUAL_MATRIX_MISSING', { slug });
  }

  if (!story.compatibilityPanel?.frameworks || story.compatibilityPanel.frameworks.length !== frameworks.length) {
    fail('UIFN_STORYBOOK_METADATA_MISSING', { slug });
  }
}

const manifestDir = file('uifn/registry/catalog/patterns');
const actualPatternCount = existsSync(manifestDir)
  ? readdirSync(manifestDir).filter((entry) => entry.endsWith('.json')).length
  : 0;

if (actualPatternCount !== expectedPatterns.length) {
  fail('UIFN_PATTERN_COUNT_MISMATCH', {
    expected: expectedPatterns.length,
    actual: actualPatternCount,
  });
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-patterns', failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-patterns',
      patternCount: expectedPatterns.length,
      frameworks,
      states: requiredStates,
      backendImports: [],
    },
    null,
    2
  )
);
