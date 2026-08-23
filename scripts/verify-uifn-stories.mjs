#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const scopeIndex = args.indexOf('--scope');
const scope = scopeIndex >= 0 ? args[scopeIndex + 1] : 'all';
const failures = [];
const executedStoryCommands = [];

const scopes = {
  'batch-a': {
    components: [
      'aspect-ratio',
      'avatar',
      'badge',
      'button',
      'card',
      'label',
      'progress',
      'separator',
      'skeleton',
      'table',
      'typography',
      'toast',
      'sonner',
    ],
    requiredStories: ['default', 'variants', 'states', 'accessibility', 'theming'],
    interactionStories: ['states'],
  },
  'batch-b': {
    components: [
      'accordion',
      'alert-dialog',
      'breadcrumb',
      'checkbox',
      'collapsible',
      'context-menu',
      'dialog',
      'dropdown-menu',
      'form',
      'hover-card',
      'input',
      'input-otp',
      'menubar',
      'pagination',
      'popover',
      'radio-group',
      'scroll-area',
      'select',
      'sheet',
      'slider',
      'switch',
      'tabs',
      'textarea',
      'toggle',
      'toggle-group',
      'tooltip',
    ],
    requiredStories: ['default', 'variants', 'states', 'accessibility', 'theming', 'keyboard', 'focus'],
    interactionStories: ['keyboard', 'focus'],
  },
  'data-rich': {
    components: ['calendar', 'date-picker', 'command', 'data-table', 'resizable', 'sidebar'],
    requiredStories: ['default', 'large-data', 'keyboard', 'empty', 'error', 'visual'],
    interactionStories: ['keyboard'],
  },
};

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function readJson(pathname) {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8'));
}

const storybookRequiredFiles = [
  'uifn/storybook/src/preset.ts',
  'uifn/storybook/src/decorators/index.ts',
  'uifn/storybook/src/panel/compatibility.ts',
  'uifn/storybook/src/generate-docs.ts',
  'uifn/storybook/src/validate-stories.ts',
  'uifn/storybook/src/__tests__/storybook.test.ts',
  'uifn/components/src/__tests__/generated-story-runner.test.ts',
  'uifn/patterns/src/patterns-story-runner.test.ts',
  'uifn/sf/src/sf-story-runner.test.ts',
];
const storyRunnerCommands = [
  ['npm', '--workspace', '@uifn/storybook', 'run', 'test', '--', 'src/__tests__/storybook.test.ts'],
  ['npm', '--workspace', '@uifn/components', 'run', 'test', '--', 'src/__tests__/generated-story-runner.test.ts'],
  ['npm', '--workspace', '@uifn/patterns', 'run', 'test', '--', 'src/patterns-story-runner.test.ts'],
  ['npm', '--workspace', '@uifn/sf', 'run', 'test', '--', 'src/sf-story-runner.test.ts'],
];

for (const pathname of storybookRequiredFiles) {
  if (!existsSync(path.join(repoRoot, pathname))) {
    fail('UIFN_STORYBOOK_ARTIFACT_MISSING', { path: pathname });
  }
}

if (scope !== 'all' && !scopes[scope]) {
  fail('UIFN_STORY_SCOPE_UNSUPPORTED', { scope });
}

const activeScopes = scope === 'all' ? Object.keys(scopes) : [scope];
const scopeSummaries = [];

for (const activeScopeName of activeScopes) {
  const activeScope = scopes[activeScopeName];

  for (const slug of activeScope.components) {
  const storyPath = `uifn/components/stories/${activeScopeName}/${slug}.stories.json`;
  const fixturePath = `uifn/components/fixtures/${activeScopeName}/${slug}.fixture.json`;
  const registryPath = `uifn/components/registry/components/${slug}.json`;

  for (const pathname of [storyPath, fixturePath, registryPath]) {
    if (!existsSync(path.join(repoRoot, pathname))) {
      fail('UIFN_STORY_ARTIFACT_MISSING', { slug, path: pathname });
    }
  }

  if (!existsSync(path.join(repoRoot, storyPath))) {
    continue;
  }

    const story = readJson(storyPath);
    const storyIds = new Set((story.stories ?? []).map((entry) => entry.id));
    for (const id of activeScope.requiredStories) {
      if (!storyIds.has(id)) {
        fail('UIFN_STORY_CASE_MISSING', { slug, story: id });
      }
    }

    const interactionCovered = activeScope.interactionStories.some((storyId) => {
      const interactionStory = (story.stories ?? []).find((entry) => entry.id === storyId);
      return interactionStory?.testUse?.includes('interaction') && interactionStory?.testUse?.includes('a11y');
    });
    if (!interactionCovered) {
      fail('UIFN_STORY_INTERACTION_A11Y_MISSING', { slug });
    }

    const visualMatrixStory = (story.stories ?? []).find((entry) => entry.id === 'visual')
      ?? (story.stories ?? []).find((entry) => entry.id === 'theming');
    if (!visualMatrixStory?.themes?.includes('high-contrast') || !visualMatrixStory?.viewport?.includes('mobile')) {
      fail('UIFN_STORY_VISUAL_MATRIX_MISSING', { slug });
    }
  }

  const registryFiles = readdirSync(path.join(repoRoot, 'uifn/components/registry/components'))
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(`uifn/components/registry/components/${file}`))
    .filter((manifest) => manifest.batch === activeScopeName);

  if (registryFiles.length !== activeScope.components.length) {
    fail('UIFN_STORY_REGISTRY_COUNT_MISMATCH', {
      scope: activeScopeName,
      expected: activeScope.components.length,
      actual: registryFiles.length,
    });
  }

  scopeSummaries.push({
    scope: activeScopeName,
    componentCount: activeScope.components.length,
    storiesPerComponent: activeScope.requiredStories.length,
  });
}

for (const command of storyRunnerCommands) {
  const result = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  });
  executedStoryCommands.push({
    command: command.join(' '),
    passed: result.status === 0,
    status: result.status,
  });
  if (result.status !== 0) {
    fail('UIFN_STORY_RUNNER_FAILED', {
      command: command.join(' '),
      stdoutTail: result.stdout.split('\n').slice(-16).join('\n').trim(),
      stderrTail: result.stderr.split('\n').slice(-16).join('\n').trim(),
    });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-stories', scope, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-stories',
      scope,
      componentCount: scopeSummaries.reduce((total, entry) => total + entry.componentCount, 0),
      scopeSummaries,
      checks: ['args-controls', 'interaction', 'a11y', 'visual-matrix', 'registry'],
      executedStoryCommands,
      storybook: {
        requiredFiles: storybookRequiredFiles,
      },
    },
    null,
    2
  )
);
