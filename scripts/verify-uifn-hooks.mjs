#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = process.cwd();
const frameworks = ['react', 'svelte', 'solid'];
const hooks = ['use-media-query', 'use-copy-to-clipboard'];
const failures = [];
const behaviorChecks = [];

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

function requireFile(pathname, code = 'UIFN_HOOK_FILE_MISSING') {
  if (!existsSync(file(pathname))) {
    fail(code, { path: pathname });
    return false;
  }

  return true;
}

function runBehaviorCheck(check) {
  const result = spawnSync(check.command, check.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
  const passed = result.status === 0;

  behaviorChecks.push({
    id: check.id,
    framework: check.framework,
    command: [check.command, ...check.args].join(' '),
    passed,
    status: result.status,
  });

  if (!passed) {
    fail('UIFN_HOOK_BEHAVIOR_TEST_FAILED', {
      id: check.id,
      framework: check.framework,
      status: result.status,
    });
  }
}

for (const check of [
  {
    id: 'dom-hook-capabilities',
    framework: 'dom',
    command: 'npm',
    args: ['--workspace', '@uifn/dom', 'run', 'test', '--', 'src/hooks.test.ts'],
  },
  {
    id: 'react-hooks',
    framework: 'react',
    command: 'npm',
    args: ['--workspace', '@uifn/react', 'run', 'test', '--', 'src/hooks/hooks.behavior.test.tsx'],
  },
  {
    id: 'svelte-hooks',
    framework: 'svelte',
    command: 'npm',
    args: ['--workspace', '@uifn/svelte', 'run', 'test', '--', 'tests/hooks.behavior.test.ts'],
  },
  {
    id: 'solid-hooks',
    framework: 'solid',
    command: 'npm',
    args: [
      '--workspace',
      '@uifn/solid',
      'exec',
      '--',
      'vitest',
      'run',
      '--config',
      'vitest.config.ts',
      'src/__tests__/hooks.behavior.test.tsx',
    ],
  },
]) {
  runBehaviorCheck(check);
}

const requiredFrameworkFiles = {
  react: [
    'uifn/react/src/hooks/use-media-query.ts',
    'uifn/react/src/hooks/use-copy-to-clipboard.ts',
    'uifn/react/src/hooks/index.ts',
    'uifn/components-react/src/index.ts',
  ],
  svelte: [
    'uifn/svelte/lib/hooks/media-query.ts',
    'uifn/svelte/lib/hooks/copy-to-clipboard.ts',
    'uifn/svelte/lib/hooks/index.ts',
    'uifn/svelte/lib/index.ts',
    'uifn/components-svelte/src/index.ts',
  ],
  solid: [
    'uifn/solid/src/hooks/media-query.ts',
    'uifn/solid/src/hooks/copy-to-clipboard.ts',
    'uifn/solid/src/hooks/index.ts',
    'uifn/solid/src/index.ts',
    'uifn/components-solid/src/index.ts',
  ],
};

const requiredSourceTokens = {
  react: ['useMediaQuery', 'useCopyToClipboard'],
  svelte: ['createMediaQuery', 'useMediaQuery', 'createCopyToClipboard', 'useCopyToClipboard', 'copyToClipboardAction'],
  solid: ['createMediaQuery', 'useMediaQuery', 'createCopyToClipboard', 'useCopyToClipboard'],
};

const requiredBehaviorTestFiles = {
  react: 'uifn/react/src/hooks/hooks.behavior.test.tsx',
  svelte: 'uifn/svelte/tests/hooks.behavior.test.ts',
  solid: 'uifn/solid/src/__tests__/hooks.behavior.test.tsx',
};

for (const framework of frameworks) {
  const files = requiredFrameworkFiles[framework];
  const source = files
    .filter((pathname) => requireFile(pathname))
    .map((pathname) => read(pathname))
    .join('\n');

  for (const token of requiredSourceTokens[framework]) {
    if (!source.includes(token)) {
      fail('UIFN_HOOK_EXPORT_MISSING', { framework, token });
    }
  }

  if (/\bwindow\b/.test(source)) {
    fail('UIFN_HOOK_WINDOW_ACCESSED_DURING_SSR', { framework });
  }
}

for (const hook of hooks) {
  const manifestPath = `uifn/registry/catalog/hooks/${hook}.json`;
  if (!requireFile(manifestPath, 'UIFN_HOOK_MANIFEST_MISSING')) {
    continue;
  }

  const manifest = readJson(manifestPath);
  if (manifest.status !== 'ga-candidate') {
    fail('UIFN_HOOK_STATUS_NOT_IMPLEMENTED', { hook, status: manifest.status });
  }

  for (const framework of frameworks) {
    const metadata = manifest.frameworks?.[framework];
    if (!metadata?.supported || !metadata.packageImport || !metadata.sourceInstall?.helperFile) {
      fail('UIFN_HOOK_FRAMEWORK_METADATA_MISSING', { hook, framework });
    }
  }

  for (const story of manifest.stories ?? []) {
    if (story.status !== 'implemented' || !requireFile(story.file, 'UIFN_HOOK_STORY_MISSING')) {
      fail('UIFN_HOOK_STORY_NOT_IMPLEMENTED', { hook, story: story.id });
    }
  }

  for (const fixture of manifest.fixtures ?? []) {
    if (fixture.status !== 'implemented' || !requireFile(fixture.file, 'UIFN_HOOK_FIXTURE_MISSING')) {
      fail('UIFN_HOOK_FIXTURE_NOT_IMPLEMENTED', { hook, fixture: fixture.id });
    }
  }

  for (const test of manifest.tests ?? []) {
    if (test.status !== 'implemented' || !requireFile(test.file, 'UIFN_HOOK_TEST_MISSING')) {
      fail('UIFN_HOOK_TEST_NOT_IMPLEMENTED', { hook, test: test.id });
    }
  }

  const manifestTestFiles = new Set((manifest.tests ?? []).map((test) => test.file));
  for (const [framework, behaviorTestFile] of Object.entries(requiredBehaviorTestFiles)) {
    if (!manifestTestFiles.has(behaviorTestFile)) {
      fail('UIFN_HOOK_FRAMEWORK_TEST_NOT_REFERENCED', {
        hook,
        framework,
        file: behaviorTestFile,
      });
    }
  }
}

const docsPath = 'uifn/registry/docs/hooks.md';
if (requireFile(docsPath, 'UIFN_HOOK_DOCS_MISSING')) {
  const docs = read(docsPath);
  for (const token of [
    'useMediaQuery',
    'useCopyToClipboard',
    '@uifn/components-react',
    '@uifn/components-svelte',
    '@uifn/components-solid',
    'components/hooks/react/use-media-query.ts',
    'components/hooks/solid/use-copy-to-clipboard.ts',
  ]) {
    if (!docs.includes(token)) {
      fail('UIFN_HOOK_DOCS_METADATA_MISSING', { token });
    }
  }

  if (/\/Users\/|\/home\/|[A-Z]:\\/.test(docs)) {
    fail('UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', { path: docsPath });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-hooks', failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-hooks',
      hookCount: hooks.length,
      frameworks,
      behaviorChecks,
      ssrValue: false,
      subscribesOnClient: true,
      cleansUp: true,
      clipboardFailureBehavior: ['clipboard-unavailable', 'clipboard-write-failed'],
    },
    null,
    2
  )
);
