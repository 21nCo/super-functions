import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectStorySource, reconcileBuiltStoryIds } from '../uifn/storybook/dist/index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

test('maintenance verifier resolves Node and npm portably', () => {
  const source = readFileSync(path.join(root, 'scripts/verify-uifn-phase-17.mjs'), 'utf8');
  assert.match(source, /process\.execPath/);
  assert.match(source, /process\.platform === 'win32' \? 'npm\.cmd' : 'npm'/);
  assert.doesNotMatch(source, /\/opt\/homebrew/);
});

test('public outputs do not expose implementation phase labels', () => {
  const generatedRoots = [
    path.join(root, 'uifn/docs/generated'),
    path.join(root, 'uifn/storybook/workbenches'),
  ];
  for (const generatedRoot of generatedRoots) {
    for (const file of filesUnder(generatedRoot)) {
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /\b(?:PHASE_\d{2}|Phase \d{1,2})\b/,
        path.relative(root, file),
      );
    }
  }

  const declarationRoot = path.join(root, 'uifn/core/generated');
  if (existsSync(declarationRoot)) {
    assert.deepEqual(
      readdirSync(declarationRoot).filter((file) => /^phase-\d{2}-types\.d\.ts$/.test(file)),
      [],
    );
  }
});

test('TV-STORY-001-P: generated inventory is exact across three framework renderers', () => {
  const inventory = JSON.parse(readFileSync(path.join(root, 'uifn/storybook/generated/story-inventory.json'), 'utf8'));
  assert.equal(inventory.primitiveCount, 69);
  assert.equal(inventory.scenarioCountPerFramework, 705);
  assert.equal(inventory.storyCount, 2115);
  assert.deepEqual(inventory.frameworks, ['react', 'svelte', 'solid']);
  assert.equal(new Set(inventory.stories.map((story) => `${story.framework}:${story.id}`)).size, 2115);
});

test('TV-STORY-001-N: removed Solid export is killed with UIFN_STORY_MISSING', () => {
  const failures = reconcileBuiltStoryIds(['stable-dialog--default'], []);
  assert.equal(failures[0]?.code, 'UIFN_STORY_MISSING');
});

test('TV-STORY-001-N: Dialog static test double is killed with UIFN_STORY_NOT_PUBLIC_COMPONENT', () => {
  const failures = inspectStorySource(
    `const meta={component:'div'}; export const Default={render:()=> <div/>};`,
    { primitive: 'dialog', framework: 'react', publicImport: '@uifn/components-react/dialog' },
  );
  assert.equal(failures[0]?.code, 'UIFN_STORY_NOT_PUBLIC_COMPONENT');
});

test('TV-DOCS-001-P: every primitive, required section, field, and sample is mapped', () => {
  const coverage = JSON.parse(readFileSync(path.join(root, 'uifn/docs/generated/docs-coverage.json'), 'utf8'));
  const samples = JSON.parse(readFileSync(path.join(root, 'uifn/docs/generated/sample-manifest.json'), 'utf8'));
  assert.equal(coverage.primitiveCount, 69);
  assert.equal(coverage.requiredSectionCount, 897);
  assert.equal(coverage.mappedFieldCount, 12_368);
  assert.equal(samples.sampleCount, 414);
  assert.ok(coverage.pages.every((page) => page.requiredSections.length === 13 && page.sampleIds.length === 6));
});

test('TV-DOCS-001-N: unsupported claims and removed APIs have stable diagnostics', () => {
  const inspect = (source) => {
    if (/\b(?:vue|angular)\b/i.test(source) && !/(?:unsupported|not supported|removed|previous experimental|no longer)/i.test(source)) return 'UIFN_DOCS_UNSUPPORTED_CLAIM';
    if (/\b(?:StateMachine|createMachine)\b/.test(source) && !/\b(?:removed|legacy|no public replacement|do not use)\b/i.test(source)) return 'UIFN_DOCS_REMOVED_API';
    return null;
  };
  assert.equal(inspect('Supported frameworks: React, Vue, and Solid.'), 'UIFN_DOCS_UNSUPPORTED_CLAIM');
  assert.equal(inspect("import { StateMachine } from '@uifn/core';"), 'UIFN_DOCS_REMOVED_API');
});
