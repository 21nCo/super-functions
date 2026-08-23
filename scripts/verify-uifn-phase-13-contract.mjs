#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const requireDist = process.argv.includes('--require-dist');
const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/.conduct/generated/phase-13/phase-13-solid-compounds.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/solid/package.json'), 'utf8'));

export const PHASE_13_MUTATION_CODES = Object.freeze({
  genericFactory: 'UIFN_SOLID_COMPOUND_MISSING',
  staleReactiveInput: 'UIFN_SOLID_REACTIVITY_STALE',
});

export function classifyPhase13Mutations(mutations = {}) {
  return Object.entries(PHASE_13_MUTATION_CODES)
    .filter(([key]) => mutations[key] === true)
    .map(([, code]) => code);
}

function pascal(value) {
  return value.split(/[-_]/).filter(Boolean).map((segment) => segment[0].toUpperCase() + segment.slice(1)).join('');
}

function visitExportTargets(value, targets = []) {
  if (typeof value === 'string') targets.push(value);
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => visitExportTargets(entry, targets));
  return targets;
}

function walkFiles(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walkFiles(absolute, files);
    else files.push(absolute);
  }
  return files;
}

export function verifyPhase13Contract(options = {}) {
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });
  const sourceDirectory = path.join(repoRoot, 'uifn/solid/src/generated');
  const sourceEntries = existsSync(sourceDirectory)
    ? readdirSync(sourceDirectory).filter((name) => name.endsWith('.tsx')).sort()
    : [];

  const expectedAnatomyCount = catalog.primitives.reduce((count, primitive) => count + primitive.anatomy.length, 0);
  if (manifest.phase !== 'PHASE_13' || manifest.primitiveCount !== catalog.primitives.length || manifest.anatomyCount !== expectedAnatomyCount) {
    add('UIFN_SOLID_INVENTORY_MISMATCH', `manifest reports ${manifest.primitiveCount}/${manifest.anatomyCount}`);
  }
  if (JSON.stringify(manifest.primitives.map((primitive) => primitive.id)) !== JSON.stringify(catalog.primitives.map((primitive) => primitive.id))) {
    add('UIFN_SOLID_CATALOG_ORDER_DRIFT', 'manifest primitive order differs from the canonical catalog');
  }
  if (sourceEntries.length !== catalog.primitives.length) {
    add(PHASE_13_MUTATION_CODES.genericFactory, `expected ${catalog.primitives.length} generated modules, received ${sourceEntries.length}`);
  }

  const publicIndexPath = path.join(repoRoot, 'uifn/solid/src/index.ts');
  const publicIndex = existsSync(publicIndexPath) ? readFileSync(publicIndexPath, 'utf8') : '';
  for (const primitive of catalog.primitives) {
    const sourcePath = path.join(sourceDirectory, `${primitive.id}.tsx`);
    if (!existsSync(sourcePath)) {
      add(PHASE_13_MUTATION_CODES.genericFactory, `${primitive.id} source module missing`);
      continue;
    }
    const source = readFileSync(sourcePath, 'utf8');
    const hostPart = primitive.name === 'Toast'
      ? primitive.anatomy.find((part) => part.id === 'viewport')
      : primitive.anatomy.find((part) => part.id === 'root') ?? primitive.anatomy[0];
    if (!publicIndex.includes(`export * from './generated/${primitive.id}.jsx';`)) {
      add(PHASE_13_MUTATION_CODES.genericFactory, `${primitive.name} public re-export missing`);
    }
    if (!source.includes(`export const ${primitive.name} = /* @__PURE__ */ Object.assign`)
      || !source.includes(`Provider: ${primitive.name}Provider`)
      || !source.includes(`Root: ${primitive.name}Root`)) {
      add('UIFN_SOLID_COMPOUND_NAMESPACE_MISSING', primitive.name);
    }
    if (primitive.implementationKind === 'interactive-controller' && !source.includes(`create${primitive.name}Controller`)) {
      add('UIFN_SOLID_CORE_CONTROLLER_MISSING', primitive.name);
    }
    if (primitive.implementationKind === 'typed-static-contract' && !source.includes(`${primitive.name}Contract`)) {
      add('UIFN_SOLID_STATIC_CONTRACT_MISSING', primitive.name);
    }
    for (const part of primitive.anatomy) {
      const component = `${primitive.name}${pascal(part.id)}`;
      if (!source.includes(`export function ${component}(`) && !source.includes(`export const ${component} =`)) {
        add(PHASE_13_MUTATION_CODES.genericFactory, `${primitive.name}.${part.id}`);
      }
      if (part.id === hostPart?.id) {
        if (!source.includes(`<SolidPrimitiveRoot definition={${primitive.name}Definition}`)) {
          add('UIFN_SOLID_CANONICAL_ROOT_MISSING', `${primitive.name}.${part.id}`);
        }
      } else {
        const partBlockStart = source.indexOf(`export function ${component}(`);
        const partBlock = partBlockStart >= 0 ? source.slice(partBlockStart, source.indexOf('\n}', partBlockStart) + 2) : '';
        if (!partBlock.includes('<SolidPrimitivePart') || !partBlock.includes(`part="${part.id}"`)) {
          add('UIFN_SOLID_CANONICAL_PART_MISSING', `${primitive.name}.${part.id}`);
        }
        if (part.cardinality === 'many' && !partBlock.includes('many={true}')) {
          add('UIFN_SOLID_KEYED_PART_VALUE_MISSING', `${primitive.name}.${part.id}`);
        }
      }
    }
  }

  const legacyPaths = [
    'uifn/solid/src/create-primitive.ts',
    'uifn/solid/src/create-primitive-factory.ts',
    'uifn/solid/src/components',
  ];
  for (const relative of legacyPaths) {
    if (existsSync(path.join(repoRoot, relative))) add(PHASE_13_MUTATION_CODES.genericFactory, relative);
  }
  if (/createPrimitiveFactory|createGenericPrimitive/.test(publicIndex)) {
    add(PHASE_13_MUTATION_CODES.genericFactory, 'generic factory is exported from the public index');
  }

  const exportTargets = visitExportTargets(packageJson.exports);
  const rawSourceTargets = exportTargets.filter((target) => target.includes('/src/') || (/\.tsx?$/.test(target) && !/\.d\.tsx?$/.test(target)));
  if (rawSourceTargets.length) add('UIFN_PACKAGE_RAW_SOURCE_EXPORT', rawSourceTargets.join(', '));
  if (packageJson.type !== 'module' || packageJson.solid !== './dist/index.js' || packageJson.types !== './dist/index.d.ts') {
    add('UIFN_SOLID_PACKAGE_METADATA_INVALID', 'Solid, types, or ESM metadata does not point at dist');
  }
  if (!packageJson.exports?.['./*'] || packageJson.engines?.node !== '>=20 <25' || packageJson.sideEffects !== false) {
    add('UIFN_SOLID_PACKAGE_SUBPATH_ENGINE_OR_EFFECTS_INVALID', 'direct subpaths, Node 20-24, or sideEffects:false missing');
  }
  if (packageJson.peerDependencies?.['solid-js'] !== '>=1.9.0 <2' || packageJson.devDependencies?.['solid-js'] !== '1.9.13') {
    add('UIFN_SOLID_PEER_RANGE_INVALID', 'expected tested Solid 1.9.13 within >=1.9.0 <2');
  }
  if (packageJson.files.some((entry) => entry.startsWith('src'))) {
    add('UIFN_PACKAGE_RAW_SOURCE_EXPORT', packageJson.files.join(', '));
  }

  const bridgePath = path.join(repoRoot, 'uifn/solid/src/internal/compound.tsx');
  const bridgeSource = existsSync(bridgePath) ? readFileSync(bridgePath, 'utf8') : '';
  const updateBody = bridgeSource.slice(bridgeSource.indexOf('  update(inputs:'), bridgeSource.indexOf('  getPartProps('));
  if (!updateBody.includes('this.current?.update(') || updateBody.includes('this.create(')) {
    add(PHASE_13_MUTATION_CODES.staleReactiveInput, 'bridge.update does not delegate to the existing controller');
  }
  if (!bridgeSource.includes('for (const key of Object.keys(props))')
    || /(?:const|let)\s+\{[^}]+\}\s*=\s*(?:props|runtime\.props|source\(\))/.test(bridgeSource)) {
    add(PHASE_13_MUTATION_CODES.staleReactiveInput, 'root input projection destructures or does not read live accessors');
  }
  for (const token of ['createEffect', 'onCleanup', 'createSolidPartPropsBinding', 'acquireUIFnDomPlatform', 'createUIFnOverlayDomBinding', 'createUIFnRangeGestureDomBinding', 'createUIFnNativeFormResetBinding', 'createUIFnPortal']) {
    if (!bridgeSource.includes(token)) add('UIFN_SOLID_LIFECYCLE_OR_DOM_OWNERSHIP_MISSING', token);
  }

  if (options.requireDist) {
    const dist = path.join(repoRoot, 'uifn/solid/dist');
    for (const relative of ['index.js', 'index.d.ts', 'internal/compound.jsx', 'internal/compound.d.ts']) {
      if (!existsSync(path.join(dist, relative))) add('UIFN_SOLID_DIST_ENTRY_MISSING', relative);
    }
    for (const primitive of catalog.primitives) {
      const jsx = path.join(dist, 'generated', `${primitive.id}.jsx`);
      const dts = path.join(dist, 'generated', `${primitive.id}.d.ts`);
      if (!existsSync(jsx) || !existsSync(dts)) {
        add('UIFN_SOLID_DIST_SUBPATH_MISSING', primitive.id);
        continue;
      }
      const declaration = readFileSync(dts, 'utf8');
      for (const part of primitive.anatomy) {
        const component = `${primitive.name}${pascal(part.id)}`;
        if (!declaration.includes(component)) add('UIFN_SOLID_DIST_TYPE_EXPORT_MISSING', component);
      }
    }
    for (const file of walkFiles(dist)) {
      const relative = path.relative(dist, file);
      if (/\.(?:ts|tsx)$/.test(file) && !/\.d\.ts$/.test(file)) add('UIFN_PACKAGE_RAW_SOURCE_EXPORT', relative);
      if (/\.(?:js|jsx)$/.test(file)) {
        const source = readFileSync(file, 'utf8');
        if (source.includes('React.createElement')) add('UIFN_SOLID_REACT_RUNTIME_LEAK', relative);
        if (/createPrimitiveFactory|createGenericPrimitive/.test(source)) add(PHASE_13_MUTATION_CODES.genericFactory, relative);
      }
      if (statSync(file).size === 0) add('UIFN_SOLID_EMPTY_DIST_FILE', relative);
    }
  }
  return issues;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const issues = verifyPhase13Contract({ requireDist });
  const result = {
    ok: issues.length === 0,
    command: `verify-uifn-phase-13-contract${requireDist ? ' --require-dist' : ''}`,
    requirement: 'SOLID-001',
    vectors: ['TV-SOLID-001-P', 'TV-SOLID-001-N'],
    primitiveCount: manifest.primitiveCount,
    anatomyCount: manifest.anatomyCount,
    solidVersion: packageJson.devDependencies['solid-js'],
    issues,
  };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
