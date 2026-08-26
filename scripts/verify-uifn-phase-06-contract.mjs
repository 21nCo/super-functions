#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = process.cwd();
const PHASE_PRIMITIVES = Object.freeze([
  'Accordion', 'Avatar', 'Button', 'Collapsible', 'Field', 'Fieldset', 'Form',
  'ImageCropper', 'Input', 'Marquee', 'QRCode', 'ScrollArea', 'Separator', 'Toolbar',
]);
const STATIC_CONTRACTS = Object.freeze([
  'AvatarContract', 'ButtonContract', 'FieldContract', 'FieldsetContract', 'FormContract',
  'InputContract', 'MarqueeContract', 'QRCodeContract', 'SeparatorContract',
]);
const CONTROLLER_FACTORIES = Object.freeze([
  'createAccordionController', 'createCollapsibleController', 'createImageCropperController',
  'createScrollAreaController', 'createToolbarController',
]);
const NATIVE_ROOTS = Object.freeze({ ButtonContract: 'button', FieldsetContract: 'fieldset', FormContract: 'form', InputContract: 'input' });

function issue(code, message, source) { return Object.freeze({ code, message, source }); }

function resolveLocalModule(fromPath, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromPath), specifier);
  const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), path.join(base, 'index.tsx')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function collectLocalDependencies(entryPath) {
  const visited = new Set();
  const pending = [entryPath];
  while (pending.length) {
    const current = pending.pop();
    if (!current || visited.has(current)) continue;
    visited.add(current);
    const source = readFileSync(current, 'utf8');
    const imports = /\b(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g;
    for (const match of source.matchAll(imports)) {
      const dependency = resolveLocalModule(current, match[1]);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return visited;
}

export function classifyPhase06Mutations(mutations) {
  const codes = [];
  if (mutations.duplicateTypeahead || mutations.localCollectionAlgorithm || mutations.localRangeAlgorithm) codes.push('UIFN_SHARED_ALGORITHM_FORK');
  if (mutations.duplicateKeyAccepted || mutations.disabledItemFocusedAfterReorder) codes.push('UIFN_COLLECTION_INVARIANT');
  if (mutations.buttonUsesDiv || mutations.nativeFormRoleReplacement) codes.push('UIFN_NATIVE_SEMANTIC_LOST');
  if (mutations.staticSubscription || mutations.staticEffect) codes.push('UIFN_STATIC_RUNTIME_COST');
  return Object.freeze(codes);
}

export async function verifyPhase06Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
  const selected = catalog.primitives.filter((primitive) => PHASE_PRIMITIVES.includes(primitive.name));
  if (JSON.stringify(selected.map((primitive) => primitive.name)) !== JSON.stringify(PHASE_PRIMITIVES)) {
    issues.push(issue('UIFN_COLLECTION_INVARIANT', 'PHASE_06 catalog ownership differs from the reviewed 14-primitive set.', 'uifn/catalog/generated/catalog.json'));
  }

  const algorithms = ['async-list', 'collection', 'id', 'locale', 'navigation', 'range', 'selection', 'typeahead', 'virtualization'];
  for (const name of algorithms) {
    if (!existsSync(path.join(repoRoot, `uifn/core/src/algorithms/${name}.ts`))) issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', `Missing canonical ${name} algorithm.`, `uifn/core/src/algorithms/${name}.ts`));
  }
  const applicable = {
    accordion: readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/accordion.ts'), 'utf8'),
    toolbar: readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/toolbar.ts'), 'utf8'),
    select: readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/select.ts'), 'utf8'),
    combobox: readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/combobox.ts'), 'utf8'),
    slider: readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/slider.ts'), 'utf8'),
  };
  const dependencyFiles = Object.fromEntries(Object.keys(applicable).map((primitive) => [
    primitive,
    collectLocalDependencies(path.join(repoRoot, `uifn/core/src/primitives/${primitive}.ts`)),
  ]));
  const requiredAlgorithms = {
    accordion: ['collection', 'navigation'], toolbar: ['collection', 'navigation'],
    select: ['collection', 'navigation', 'typeahead'],
    combobox: ['collection', 'locale', 'navigation', 'virtualization'],
    slider: ['range'],
  };
  for (const [primitive, algorithmsForPrimitive] of Object.entries(requiredAlgorithms)) {
    for (const algorithm of algorithmsForPrimitive) {
      const expectedPath = path.join(repoRoot, `uifn/core/src/algorithms/${algorithm}.ts`);
      if (!dependencyFiles[primitive].has(expectedPath)) {
        issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', `${primitive} does not reach algorithms/${algorithm} through its local dependency graph.`, `uifn/core/src/primitives/${primitive}.ts`));
      }
    }
  }
  if (/function\s+(?:resolveTypeaheadMatch|dedupeOptions)\b|\.toLowerCase\(\)\.startsWith\(/.test(applicable.select)) {
    issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', 'Select retains a local typeahead or collection fork.', 'uifn/core/src/primitives/select.ts'));
  }
  if (/new\s+Map<[^>]*>\(\)[\s\S]{0,300}\.set\([^)]*\.value/.test(applicable.combobox)) {
    issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', 'Combobox retains last-write-wins collection deduplication.', 'uifn/core/src/primitives/combobox.ts'));
  }

  const staticFiles = ['avatar', 'button', 'field', 'fieldset', 'form', 'input', 'marquee', 'qr-code', 'separator'];
  for (const name of staticFiles) {
    const source = readFileSync(path.join(repoRoot, `uifn/core/src/primitives/${name}.ts`), 'utf8');
    if (/createUIFnController|createStateChannel|\bsubscribe\s*[:(]|\$effect|useEffect|setTimeout\s*\(/.test(source)) {
      issues.push(issue('UIFN_STATIC_RUNTIME_COST', `${name} contains an interactive runtime, subscription, or effect.`, `uifn/core/src/primitives/${name}.ts`));
    }
  }

  let publicCore = null;
  if (requireDist) {
    const dist = path.join(repoRoot, 'uifn/core/dist/index.mjs');
    if (!existsSync(dist)) issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', 'Built core entrypoint is required.', 'uifn/core/dist/index.mjs'));
    else publicCore = await import(`${pathToFileURL(dist).href}?phase06=${Date.now()}`);
  }
  if (publicCore) {
    for (const symbol of [...STATIC_CONTRACTS, ...CONTROLLER_FACTORIES]) {
      if (!(symbol in publicCore)) issues.push(issue('UIFN_SHARED_ALGORITHM_FORK', `Public build omits ${symbol}.`, 'uifn/core/dist/index.mjs'));
    }
    for (const contractName of STATIC_CONTRACTS) {
      const contract = publicCore[contractName];
      if (!contract || contract.kind !== 'typed-static-contract' || 'subscribe' in contract || 'actions' in contract || 'destroy' in contract) {
        issues.push(issue('UIFN_STATIC_RUNTIME_COST', `${contractName} is not a pure static contract.`, 'uifn/core/dist/index.mjs'));
      }
    }
    for (const [contractName, element] of Object.entries(NATIVE_ROOTS)) {
      if (publicCore[contractName]?.anatomy?.[0]?.element !== element) issues.push(issue('UIFN_NATIVE_SEMANTIC_LOST', `${contractName} does not require native ${element}.`, 'uifn/core/dist/index.mjs'));
    }
    const button = publicCore.ButtonContract?.getParts({ loading: true }, { scopeId: 'phase-06' })?.root;
    if (button?.role !== undefined || button?.attributes?.type !== 'button' || button?.disabled !== true) issues.push(issue('UIFN_NATIVE_SEMANTIC_LOST', 'ButtonContract does not preserve native button semantics.', 'uifn/core/dist/index.mjs'));
    const separator = publicCore.SeparatorContract?.getParts({ decorative: false }, { scopeId: 'phase-06' })?.root;
    if (separator?.role !== 'separator') issues.push(issue('UIFN_NATIVE_SEMANTIC_LOST', 'SeparatorContract lost separator semantics.', 'uifn/core/dist/index.mjs'));
  }

  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-phase-06-contract',
    requirements: ['CAT-002', 'PRIM-001'],
    vectors: ['TV-CAT-002-P', 'TV-CAT-002-N', 'TV-PRIM-001-P', 'TV-PRIM-001-N'],
    primitiveCount: selected.length,
    algorithmCount: algorithms.length,
    staticContractCount: STATIC_CONTRACTS.length,
    controllerCount: CONTROLLER_FACTORIES.length,
    issues,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase06Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
