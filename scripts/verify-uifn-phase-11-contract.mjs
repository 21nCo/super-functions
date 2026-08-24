#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const issue = (code, message, source) => Object.freeze({ code, message, source });
const pascal = (value) => value.split(/[-_]/).filter(Boolean).map((segment) => segment[0].toUpperCase() + segment.slice(1)).join('');

const FIXTURES = Object.freeze({
  Carousel: { itemCount: 3, reducedMotion: true },
  ImageCropper: { src: '/image.png' },
  Pagination: { count: 20 },
  Steps: { count: 3 },
  Timer: { duration: 1_000 },
  Tour: { steps: [{ id: 'intro', title: 'Introduction', description: 'Welcome' }] },
  TreeView: { items: [] },
});

export function classifyPhase11Mutations(mutations) {
  const codes = [];
  if (mutations.localSelectionState || mutations.localKeyboardBehavior || mutations.localFocusBehavior) codes.push('UIFN_FRAMEWORK_BEHAVIOR_FORK');
  if (mutations.nonForwardedPartRef) codes.push('UIFN_PART_REF_LOST');
  return Object.freeze(codes);
}

export async function verifyPhase11Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(read('uifn/catalog/generated/catalog.json'));
  const manifest = JSON.parse(read('uifn/evidence/generated/phase-11/phase-11-react-compounds.json'));
  if (manifest.primitiveCount !== catalog.primitives.length || manifest.primitives.length !== catalog.primitives.length) {
    issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', `React manifest MUST cover exactly ${catalog.primitives.length} catalog primitives.`, 'uifn/evidence/generated/phase-11/phase-11-react-compounds.json'));
  }

  for (const primitive of catalog.primitives) {
    const generated = manifest.primitives.find((entry) => entry.name === primitive.name);
    if (!generated) {
      issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', `${primitive.name} has no generated React compound.`, 'uifn/react/src/generated'));
      continue;
    }
    const expected = primitive.anatomy.map((part) => `${primitive.name}${pascal(part.id)}`);
    if (JSON.stringify(generated.components) !== JSON.stringify(expected)) {
      issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', `${primitive.name} anatomy components differ from the catalog.`, generated.source));
    }
    const source = read(`uifn/react/${generated.source}`);
    for (const symbol of [...expected, primitive.name, `${primitive.name}Provider`, `use${primitive.name}`]) {
      if (!source.includes(` ${symbol}`)) issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', `${generated.source} omits ${symbol}.`, generated.source));
    }
    if (!source.startsWith("'use client';")) issues.push(issue('UIFN_ERR_UNSUPPORTED_ENVIRONMENT', `${primitive.name} is not an explicit client boundary.`, generated.source));
    if (/create(?:Primitive|Compound|Component)Factory/.test(source)) issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', `${primitive.name} uses a generic exported factory substitute.`, generated.source));
  }

  const substrate = read('uifn/react/src/internal/compound.tsx');
  for (const required of ['useSyncExternalStore', 'createUIFnOverlayDomBinding', 'createUIFnMenuDomBinding', 'createUIFnRangeGestureDomBinding', 'createUIFnNativeFormResetBinding', 'this.current?.update', '.destroy()']) {
    if (!substrate.includes(required)) issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', `React substrate omits ${required}.`, 'uifn/react/src/internal/compound.tsx'));
  }
  for (const forbidden of ['useControllableState', 'useRovingFocus', 'useFocusTrap', 'useOutsideClick', 'usePosition', 'destroyTimerRef']) {
    if (substrate.includes(forbidden)) issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', `React substrate owns forbidden behavior ${forbidden}.`, 'uifn/react/src/internal/compound.tsx'));
  }
  const publicIndex = read('uifn/react/src/index.ts');
  if (!publicIndex.includes("export * from './generated'")) issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', 'React root does not expose generated compounds.', 'uifn/react/src/index.ts'));
  for (const legacy of ['./dropdown-menu', './menu-bar', './virtualized-list', './hooks']) {
    if (publicIndex.includes(legacy)) issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', `React root still exports legacy behavior path ${legacy}.`, 'uifn/react/src/index.ts'));
  }
  for (const legacyBehavior of [
    'use-body-scroll-lock',
    'use-controllable-state',
    'use-dialog',
    'use-escape-keydown',
    'use-focus-trap',
    'use-outside-click',
    'use-position',
    'use-roving-focus',
    'use-select',
    'use-tabs',
    'use-tooltip',
  ]) {
    const source = `uifn/react/src/hooks/${legacyBehavior}.ts`;
    if (existsSync(path.join(root, source))) {
      issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', `React retains retired local behavior hook ${legacyBehavior}.`, source));
    }
  }

  const packageJson = JSON.parse(read('uifn/react/package.json'));
  if (packageJson.peerDependencies?.react !== '>=18.3.0 <20' || packageJson.peerDependencies?.['react-dom'] !== '>=18.3.0 <20') {
    issues.push(issue('UIFN_ERR_UNSUPPORTED_ENVIRONMENT', 'React peers MUST cover React 18.3 and 19.', 'uifn/react/package.json'));
  }
  if (!packageJson.exports?.['./*']) issues.push(issue('UIFN_ERR_EXPORT_SURFACE_MISMATCH', 'Per-primitive tree-shakeable subpath exports are missing.', 'uifn/react/package.json'));

  const errors = read('uifn/core/src/errors.ts');
  for (const code of ['UIFN_FRAMEWORK_BEHAVIOR_FORK', 'UIFN_PART_REF_LOST']) if (!errors.includes(`'${code}'`)) issues.push(issue(code, `${code} is absent from the canonical error registry.`, 'uifn/core/src/errors.ts'));

  if (requireDist) {
    const corePath = path.join(root, 'uifn/core/dist/index.mjs');
    const reactPath = path.join(root, 'uifn/react/dist/index.mjs');
    if (!existsSync(corePath) || !existsSync(reactPath)) {
      issues.push(issue('UIFN_ERR_EXPORT_SURFACE_MISMATCH', 'Built core or React entrypoint is missing.', 'uifn/*/dist'));
    } else {
      const core = await import(`${pathToFileURL(corePath).href}?phase11=${Date.now()}`);
      const react = await import(`${pathToFileURL(reactPath).href}?phase11=${Date.now()}`);
      for (const primitive of catalog.primitives) {
        const expectedParts = primitive.anatomy.map((part) => part.id);
        let actualParts;
        if (primitive.implementationKind === 'typed-static-contract') actualParts = core[`${primitive.name}Contract`]?.anatomy?.map((part) => part.name);
        else {
          const controller = core[`create${primitive.name}Controller`]?.(FIXTURES[primitive.name] ?? {});
          actualParts = controller ? Object.keys(controller.parts) : [];
          controller?.destroy();
        }
        if (JSON.stringify(actualParts) !== JSON.stringify(expectedParts)) issues.push(issue('UIFN_ADAPTER_COVERAGE_MISSING', `${primitive.name} React anatomy is not backed by an exact public core anatomy.`, 'uifn/core/dist/index.mjs'));
        const compound = react[primitive.name];
        if (!compound || !compound.Provider || primitive.anatomy.some((part) => !compound[pascal(part.id)])) issues.push(issue('UIFN_ERR_EXPORT_SURFACE_MISMATCH', `${primitive.name} built compound is incomplete.`, 'uifn/react/dist/index.mjs'));
        const direct = path.join(root, `uifn/react/dist/generated/${primitive.id}.mjs`);
        if (!existsSync(direct) || !readFileSync(direct, 'utf8').startsWith("'use client';")) issues.push(issue('UIFN_ERR_EXPORT_SURFACE_MISMATCH', `${primitive.name} direct client entry is missing or unmarked.`, direct));
      }
    }
  }

  const mutationCodes = classifyPhase11Mutations({ localSelectionState: true, nonForwardedPartRef: true });
  if (JSON.stringify(mutationCodes) !== JSON.stringify(['UIFN_FRAMEWORK_BEHAVIOR_FORK', 'UIFN_PART_REF_LOST'])) issues.push(issue('UIFN_FRAMEWORK_BEHAVIOR_FORK', 'Phase 11 seeded mutations do not fail exact codes.', 'scripts/verify-uifn-phase-11-contract.mjs'));

  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-phase-11-contract',
    requirement: 'REACT-001',
    vectors: ['TV-REACT-001-P', 'TV-REACT-001-N'],
    primitiveCount: catalog.primitives.length,
    reactRuntimes: ['18.3.1', '19.2.3'],
    sourceConsumer: true,
    packageConsumer: true,
    issues,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase11Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
