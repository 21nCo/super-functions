#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const componentsRoot = path.join(repoRoot, 'uifn', 'components');
const componentRegistryDir = path.join(componentsRoot, 'registry', 'components');
const frameworkEntries = ['react', 'svelte', 'solid'];
const expectedComponentCount = 45;
const failures = [];

function rel(...segments) {
  return path.join('uifn', 'components', ...segments);
}

function file(...segments) {
  return path.join(componentsRoot, ...segments);
}

function read(...segments) {
  return readFileSync(file(...segments), 'utf8');
}

function fail(code, message, detail = {}) {
  failures.push({ code, message, ...detail });
}

function assertNoDescriptorFactories() {
  const sharedFiles = [
    rel('src', 'shared', 'batch-a.ts'),
    rel('src', 'shared', 'batch-b.ts'),
    rel('src', 'shared', 'data-rich.ts'),
  ];

  for (const pathname of sharedFiles) {
    const source = readFileSync(path.join(repoRoot, pathname), 'utf8');
    for (const token of [
      'RenderDescriptor',
      'renderBatchAComponent',
      'renderBatchBComponent',
      'createFrameworkBatchAComponent',
      'createFrameworkBatchBComponent',
      'createFrameworkDataRichComponent',
      "source: 'clean-room-controller'",
    ]) {
      if (source.includes(token)) {
        fail('UIFN_COMPONENT_DESCRIPTOR_ONLY', `${pathname} still exposes descriptor-only component factories`, {
          path: pathname,
          token,
        });
      }
    }
  }
}

function assertFrameworkEntriesAreRenderable() {
  for (const framework of frameworkEntries) {
    const entryFiles = [
      rel('src', framework, 'batch-a.ts'),
      rel('src', framework, 'batch-b.ts'),
      rel('src', framework, 'data-rich.ts'),
    ];

    for (const pathname of entryFiles) {
      const source = readFileSync(path.join(repoRoot, pathname), 'utf8');
      const factoryOnly =
        source.includes('createFrameworkBatchAComponent') ||
        source.includes('createFrameworkBatchBComponent') ||
        source.includes('createFrameworkDataRichComponent');
      if (factoryOnly) {
        fail('UIFN_COMPONENT_FRAMEWORK_EXPORT_NOT_RENDERABLE', `${pathname} exports factory descriptors instead of framework-native renderables`, {
          path: pathname,
          framework,
        });
      }
    }
  }
}

function assertBehaviorTestsRenderComponents() {
  const testFiles = [
    rel('src', '__tests__', 'batch-a.test.ts'),
    rel('src', '__tests__', 'batch-b.test.ts'),
    rel('src', '__tests__', 'data-rich.test.ts'),
  ];

  for (const pathname of testFiles) {
    const source = readFileSync(path.join(repoRoot, pathname), 'utf8');
    const hasOnlyMetadataAssertions =
      source.includes('toBeTypeOf') ||
      source.includes('renderBatchAComponent') ||
      source.includes('renderBatchBComponent') ||
      source.includes('createDataTableController');
    const hasRenderHarness =
      source.includes('@testing-library') ||
      source.includes('renderToString') ||
      source.includes('mount(') ||
      source.includes('TestBed.configureTestingModule');

    if (hasOnlyMetadataAssertions && !hasRenderHarness) {
      fail('UIFN_COMPONENT_TESTS_NOT_RENDERING', `${pathname} validates metadata/controllers without a framework render harness`, {
        path: pathname,
      });
    }
  }
}

function assertPrimitiveSemanticsAreCoreBacked() {
  const interactivePath = rel('src', 'shared', 'interactive.ts');
  const interactiveSource = readFileSync(path.join(repoRoot, interactivePath), 'utf8');
  for (const token of [
    "from '@uifn/adapter-kit'",
    'createAdapterPrimitiveController',
    'getAdapterPrimitivePartProps',
    'PRIMITIVE_BY_COMPONENT_SLUG',
    "'alert-dialog': 'alert-dialog'",
    "select: 'select'",
    "tabs: 'tabs'",
    "sheet: 'dialog'",
  ]) {
    if (!interactiveSource.includes(token)) {
      fail('UIFN_COMPONENT_PRIMITIVE_SEMANTICS_NOT_CORE_BACKED', `${interactivePath} does not prove primitive-backed components compose core controllers`, {
        path: interactivePath,
        token,
      });
    }
  }

  const batchBTestPath = rel('src', '__tests__', 'batch-b.test.ts');
  const batchBTestSource = readFileSync(path.join(repoRoot, batchBTestPath), 'utf8');
  for (const token of [
    'derives primitive-backed anatomy semantics from core controllers',
    'getSemanticPartSpec',
    'alertdialog',
    'aria-selected',
    'data-state',
  ]) {
    if (!batchBTestSource.includes(token)) {
      fail('UIFN_COMPONENT_PRIMITIVE_SEMANTICS_TEST_MISSING', `${batchBTestPath} does not lock controller-backed primitive semantics`, {
        path: batchBTestPath,
        token,
      });
    }
  }
}

function assertRegistryManifests() {
  if (!existsSync(componentRegistryDir)) {
    fail('UIFN_COMPONENT_REGISTRY_MISSING', 'component implementation registry is missing', {
      path: rel('registry', 'components'),
    });
    return;
  }

  const manifests = readdirSync(componentRegistryDir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => ({
      file: entry,
      manifest: JSON.parse(readFileSync(path.join(componentRegistryDir, entry), 'utf8')),
    }));

  if (manifests.length !== expectedComponentCount) {
    fail('UIFN_COMPONENT_COUNT_MISMATCH', `expected ${expectedComponentCount} component manifests`, {
      expected: expectedComponentCount,
      actual: manifests.length,
    });
  }

  for (const { file: manifestFile, manifest } of manifests) {
    if (manifest.status !== 'implemented') {
      fail('UIFN_COMPONENT_NOT_IMPLEMENTED', `${manifestFile} is not marked implemented`, {
        path: rel('registry', 'components', manifestFile),
        status: manifest.status,
      });
    }

    for (const framework of frameworkEntries) {
      const metadata = manifest.frameworks?.[framework];
      if (!metadata?.entry || !metadata.exportName) {
        fail('UIFN_COMPONENT_FRAMEWORK_METADATA_MISSING', `${manifestFile} missing ${framework} entry/export metadata`, {
          path: rel('registry', 'components', manifestFile),
          framework,
        });
        continue;
      }

      if (!existsSync(path.join(repoRoot, metadata.entry))) {
        fail('UIFN_COMPONENT_FRAMEWORK_ENTRY_MISSING', `${manifestFile} ${framework} entry file is missing`, {
          path: rel('registry', 'components', manifestFile),
          framework,
          entry: metadata.entry,
        });
      }
    }
  }
}

assertNoDescriptorFactories();
assertFrameworkEntriesAreRenderable();
assertBehaviorTestsRenderComponents();
assertPrimitiveSemanticsAreCoreBacked();
assertRegistryManifests();

if (failures.length > 0) {
  console.error(JSON.stringify({
    ok: false,
    command: 'verify:uifn-components',
    failureCount: failures.length,
    failures: failures.slice(0, 120),
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  command: 'verify:uifn-components',
  componentCount: expectedComponentCount,
  frameworks: frameworkEntries,
}, null, 2));
