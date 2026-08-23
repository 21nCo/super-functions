#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterRoot = path.join(repoRoot, 'uifn/adapter-kit');
const sourceRoot = path.join(adapterRoot, 'src');
const allowedRuntimeFiles = new Set([
  'conformance.ts',
  'index.ts',
  'lifecycle.ts',
  'merge-props.ts',
  'refs.ts',
  'ssr.ts',
]);

const behaviorPatterns = [
  /\bcreate[A-Z][A-Za-z0-9]*Controller\b/,
  /\bcreate(?:Store|Machine|Transition|Reducer)\b/,
  /\b(?:transition|reducer|guard|alwaysTransition|currentState)\b/,
  /(?:case\s+['"]Arrow|event\.key\s*(?:===|!==)|switch\s*\([^)]*\.key\s*\))/,
];
const domOwnershipPatterns = [
  /\bcreate(?:Focus|Portal|Layer|Position|ScrollLock|Presence|Modal)[A-Za-z0-9]*\b/,
  /\b(?:document|window|navigator)\s*\./,
  /@uifn\/dom/,
];

function collectRuntimeSources() {
  if (!existsSync(sourceRoot)) return [];
  return readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => ({
      file: `uifn/adapter-kit/src/${entry.name}`,
      name: entry.name,
      source: readFileSync(path.join(sourceRoot, entry.name), 'utf8'),
    }));
}

function primitiveNames() {
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
  return catalog.primitives.map((primitive) => primitive.name);
}

export function scanAdapterKitSources(sources, names = []) {
  const issues = [];
  for (const source of sources) {
    if (!allowedRuntimeFiles.has(source.name)) {
      issues.push({
        code: 'UIFN_ADAPTER_BEHAVIOR_FORK',
        path: source.file,
        message: `Unexpected adapter-kit runtime module ${source.name}; the package boundary is translation, lifecycle, refs, and traces only.`,
      });
    }
    for (const pattern of behaviorPatterns) {
      const match = source.source.match(pattern);
      if (match) issues.push({ code: 'UIFN_ADAPTER_BEHAVIOR_FORK', path: source.file, match: match[0], message: 'Adapter-kit contains behavior or keyboard ownership.' });
    }
    for (const pattern of domOwnershipPatterns) {
      const match = source.source.match(pattern);
      if (match) issues.push({ code: 'UIFN_ADAPTER_BEHAVIOR_FORK', path: source.file, match: match[0], message: 'Adapter-kit contains DOM-service ownership.' });
    }
    for (const name of names) {
      const match = source.source.match(new RegExp(`\\b${name}\\b`));
      if (match) issues.push({ code: 'UIFN_ADAPTER_BEHAVIOR_FORK', path: source.file, match: name, message: 'Adapter-kit contains a primitive-specific branch.' });
    }
  }
  return issues;
}

export function classifyPhase14AdapterMutations({ source = '', normalizeCallbackOrder = false } = {}) {
  const issues = scanAdapterKitSources([{ file: 'mutation.ts', name: 'conformance.ts', source }], primitiveNames());
  const codes = issues.length > 0 ? ['UIFN_ADAPTER_BEHAVIOR_FORK'] : [];
  if (normalizeCallbackOrder) codes.push('UIFN_TRACE_NORMALIZATION_LOSSY');
  return codes;
}

export function verifyPhase14AdapterKit() {
  const manifest = JSON.parse(readFileSync(path.join(adapterRoot, 'package.json'), 'utf8'));
  const lock = JSON.parse(readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
  const locked = lock.packages?.['uifn/adapter-kit'];
  const issues = scanAdapterKitSources(collectRuntimeSources(), primitiveNames());
  if (manifest.dependencies?.['@uifn/dom']) {
    issues.push({ code: 'UIFN_ADAPTER_BEHAVIOR_FORK', path: 'uifn/adapter-kit/package.json', message: 'Adapter-kit MUST NOT own or wrap DOM services.' });
  }
  if (manifest.engines?.node !== '>=20 <25') {
    issues.push({ code: 'UIFN_PEER_RANGE_UNVERIFIED', path: 'uifn/adapter-kit/package.json', message: 'Adapter-kit Node engine range does not match the Phase 14 matrix.' });
  }
  if (locked?.dependencies?.['@uifn/dom'] || locked?.dependencies?.['@uifn/core'] !== '0.0.1' || locked?.engines?.node !== '>=20 <25') {
    issues.push({ code: 'UIFN_ADAPTER_BEHAVIOR_FORK', path: 'package-lock.json#/packages/uifn~1adapter-kit', message: 'Lockfile adapter-kit boundary is stale or owns DOM services.' });
  }
  const output = {
    ok: issues.length === 0,
    command: 'verify:uifn-phase-14-adapter',
    requirements: ['ADAPT-001'],
    vectors: ['TV-ADAPT-001-P', 'TV-ADAPT-001-N'],
    runtimeFiles: collectRuntimeSources().map((source) => source.file),
    issues,
  };
  return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = verifyPhase14AdapterKit();
  console[output.ok ? 'log' : 'error'](JSON.stringify(output, null, 2));
  process.exit(output.ok ? 0 : 1);
}
