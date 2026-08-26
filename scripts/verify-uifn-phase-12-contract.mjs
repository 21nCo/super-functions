#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const requireDist = process.argv.includes('--require-dist');
const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/evidence/generated/phase-12/phase-12-svelte-compounds.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/svelte/package.json'), 'utf8'));

export const PHASE_12_MUTATION_CODES = Object.freeze({
  rawSourceExport: 'UIFN_PACKAGE_RAW_SOURCE_EXPORT',
  recreateControllerOnUpdate: 'UIFN_SERVICE_RECREATED_ON_UPDATE',
});

export function classifyPhase12Mutations(mutations = {}) {
  return Object.entries(PHASE_12_MUTATION_CODES)
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

export function verifyPhase12Contract(options = {}) {
  const issues = [];
  const add = (code, detail) => issues.push({ code, detail });
  const expectedAnatomyCount = catalog.primitives.reduce((count, primitive) => count + primitive.anatomy.length, 0);
  if (manifest.phase !== 'PHASE_12' || manifest.primitiveCount !== catalog.primitives.length || manifest.anatomyCount !== expectedAnatomyCount) {
    add('UIFN_SVELTE_INVENTORY_MISMATCH', `manifest reports ${manifest.primitiveCount}/${manifest.anatomyCount}`);
  }
  if (JSON.stringify(manifest.primitives.map((primitive) => primitive.id)) !== JSON.stringify(catalog.primitives.map((primitive) => primitive.id))) {
    add('UIFN_SVELTE_CATALOG_ORDER_DRIFT', 'manifest primitive order differs from the canonical catalog');
  }

  for (const primitive of catalog.primitives) {
    const directory = path.join(repoRoot, 'uifn/svelte/lib/generated', primitive.id);
    const indexPath = path.join(directory, 'index.ts');
    const definitionPath = path.join(directory, 'definition.ts');
    if (!existsSync(indexPath) || !existsSync(definitionPath)) {
      add('UIFN_SVELTE_PRIMITIVE_MODULE_MISSING', primitive.id);
      continue;
    }
    const index = readFileSync(indexPath, 'utf8');
    const definition = readFileSync(definitionPath, 'utf8');
    if (!index.includes(`export const ${primitive.name}`) || !index.includes(`Provider: ${primitive.name}Provider`)) {
      add('UIFN_SVELTE_COMPOUND_NAMESPACE_MISSING', primitive.name);
    }
    if (!definition.includes(`create${primitive.name}Controller`) && primitive.implementationKind === 'interactive-controller') {
      add('UIFN_SVELTE_CORE_CONTROLLER_MISSING', primitive.name);
    }
    if (!definition.includes(`${primitive.name}Contract`) && primitive.implementationKind === 'typed-static-contract') {
      add('UIFN_SVELTE_STATIC_CONTRACT_MISSING', primitive.name);
    }
    for (const part of primitive.anatomy) {
      const component = `${primitive.name}${pascal(part.id)}`;
      const componentPath = path.join(directory, `${pascal(part.id)}.svelte`);
      if (!existsSync(componentPath)) {
        add('UIFN_SVELTE_ANATOMY_COMPONENT_MISSING', `${primitive.name}.${part.id}`);
        continue;
      }
      const source = readFileSync(componentPath, 'utf8');
      if (!index.includes(`export const ${component}`)) add('UIFN_SVELTE_ANATOMY_EXPORT_MISSING', component);
      if (!source.includes(part.id === (primitive.name === 'Toast' ? 'viewport' : 'root') ? '<PrimitiveRoot' : '<PrimitivePart')) {
        add('UIFN_SVELTE_CANONICAL_BRIDGE_MISSING', `${primitive.name}.${part.id}`);
      }
      if (part.cardinality === 'many' && part.id !== (primitive.name === 'Toast' ? 'viewport' : 'root') && !source.includes('value,')) {
        add('UIFN_SVELTE_KEYED_PART_VALUE_MISSING', `${primitive.name}.${part.id}`);
      }
    }
  }

  const exportTargets = visitExportTargets(packageJson.exports);
  const isRawSourceTarget = (target) => target.includes('/src/')
    || target.includes('/lib/')
    || (/\.tsx?$/.test(target) && !/\.d\.tsx?$/.test(target));
  if (exportTargets.some(isRawSourceTarget)) {
    add(PHASE_12_MUTATION_CODES.rawSourceExport, exportTargets.filter(isRawSourceTarget).join(', '));
  }
  if (packageJson.svelte !== './dist/index.js' || packageJson.types !== 'dist/index.d.ts' || packageJson.type !== 'module') {
    add('UIFN_SVELTE_PACKAGE_METADATA_INVALID', 'Svelte, types, or ESM metadata does not point at dist');
  }
  if (!packageJson.exports?.['./*'] || packageJson.engines?.node !== '>=20 <25') {
    add('UIFN_SVELTE_PACKAGE_SUBPATH_OR_ENGINE_INVALID', 'direct subpaths or Node 20-24 engine metadata missing');
  }
  if (packageJson.files.some((entry) => entry.startsWith('src') || entry.startsWith('lib'))) {
    add(PHASE_12_MUTATION_CODES.rawSourceExport, packageJson.files.join(', '));
  }

  const bridgeSource = readFileSync(path.join(repoRoot, 'uifn/svelte/lib/internal/compound.ts'), 'utf8');
  const updateBody = bridgeSource.slice(bridgeSource.indexOf('  update(inputs:'), bridgeSource.indexOf('  getPartProps('));
  if (!updateBody.includes('this.current?.update(') || updateBody.includes('this.create(')) {
    add(PHASE_12_MUTATION_CODES.recreateControllerOnUpdate, 'bridge.update does not delegate directly to controller.update');
  }
  for (const token of ['acquireUIFnDomPlatform', 'createUIFnOverlayDomBinding', 'createUIFnRangeGestureDomBinding', 'createUIFnNativeFormResetBinding', 'createUIFnPortal']) {
    if (!bridgeSource.includes(token)) add('UIFN_SVELTE_DOM_OWNERSHIP_MISSING', token);
  }

  if (options.requireDist) {
    const dist = path.join(repoRoot, 'uifn/svelte/dist');
    if (!existsSync(path.join(dist, 'index.js')) || !existsSync(path.join(dist, 'index.d.ts'))) {
      add('UIFN_SVELTE_DIST_ENTRY_MISSING', 'dist/index.js or dist/index.d.ts');
    } else {
      for (const primitive of catalog.primitives) {
        const directory = path.join(dist, 'generated', primitive.id);
        if (!existsSync(path.join(directory, 'index.js')) || !existsSync(path.join(directory, 'index.d.ts'))) {
          add('UIFN_SVELTE_DIST_SUBPATH_MISSING', primitive.id);
        }
        for (const part of primitive.anatomy) {
          if (!existsSync(path.join(directory, `${pascal(part.id)}.svelte`)) || !existsSync(path.join(directory, `${pascal(part.id)}.svelte.d.ts`))) {
            add('UIFN_SVELTE_DIST_COMPONENT_MISSING', `${primitive.id}/${pascal(part.id)}`);
          }
        }
      }
      const rawTypeScript = [];
      const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const absolute = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(absolute);
          else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) rawTypeScript.push(path.relative(dist, absolute));
        }
      };
      walk(dist);
      if (rawTypeScript.length) add(PHASE_12_MUTATION_CODES.rawSourceExport, rawTypeScript.join(', '));
    }
  }
  return issues;
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const issues = verifyPhase12Contract({ requireDist });
  const result = {
    ok: issues.length === 0,
    command: `verify-uifn-phase-12-contract${requireDist ? ' --require-dist' : ''}`,
    requirement: 'SVELTE-001',
    vectors: ['TV-SVELTE-001-P', 'TV-SVELTE-001-N'],
    primitiveCount: manifest.primitiveCount,
    anatomyCount: manifest.anatomyCount,
    issues,
  };
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
