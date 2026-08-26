#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRepoRoot = process.cwd();
const ignoredDirectories = new Set([
  '.conduct', '.git', '.next', '.nuxt', '.output', '.svelte-kit', '.vite', '.vite-vitest',
  '.vinxi', 'build', 'coverage', 'dist', 'node_modules', 'out', 'storybook-static',
]);
const readableExtensions = new Set(['.cjs', '.css', '.html', '.js', '.json', '.md', '.mjs', '.mts', '.svelte', '.ts', '.tsx', '.yaml', '.yml']);
const semanticAllowlist = new Set([
  'uifn/MIGRATION_REMOVED_FRAMEWORKS.md',
  'uifn/package-graph.json',
  'uifn/package-graph.schema.json',
  'uifn/registry/src/schema.ts',
  'uifn/registry/src/__tests__/registry-cli.test.ts',
  'uifn/registry/src/__tests__/stable-lane.test.ts',
  'uifn/registry/README.md',
  'uifn/docs/generated/migration.md',
  'uifn/evidence/contracts/baseline.json',
  'uifn/evidence/contracts/fixtures/phase-01/removed-framework-reference.json',
  'uifn/evidence/contracts/ownership.json',
  'uifn/evidence/contracts/program-decisions.json',
  'uifn/evidence/provenance/readiness-audit.md',
  'uifn/evidence/provenance/readiness-spec.md',
  'scripts/generate-uifn-phase-17.mjs',
  'scripts/verify-uifn-phase-17-contract.test.mjs',
  'scripts/verify-uifn-phase-17-docs.mjs',
  'scripts/verify-uifn-clean.mjs',
  'scripts/verify-uifn-clean.test.mjs',
]);
const removedTokens = ['vue', 'angular'];
const legacyFrameworkAssumptions = [
  { code: 'UIFN_ALL_FRAMEWORK_ASSUMPTION', pattern: /\ball five frameworks\b/i },
  { code: 'UIFN_ALL_FRAMEWORK_ASSUMPTION', pattern: /\b5\s+frameworks\b/i },
  { code: 'UIFN_ALL_FRAMEWORK_ASSUMPTION', pattern: /["']?frameworks["']?\s*:\s*5\b/i },
  { code: 'UIFN_LEGACY_COMPONENTS_SUBPATH', pattern: /uifn\/components\/src\/(?:react|svelte|solid)\//i },
];
const deletedPaths = [
  'uifn/vue',
  'uifn/angular',
  'uifn/catalogs/vue',
  'uifn/catalogs/angular',
  'uifn/examples/vue-workbench',
  'uifn/examples/angular-workbench',
  'uifn/examples/vue-playground',
  'uifn/components/dist/vue',
  'uifn/components/dist/angular',
];

function walk(repoRoot, relative) {
  const absolute = path.join(repoRoot, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const pathname = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : walk(repoRoot, pathname);
    return readableExtensions.has(path.extname(entry.name)) ? [pathname] : [];
  });
}

export function scanRemovedFrameworkReferences(pathname, source) {
  if (semanticAllowlist.has(pathname)) return [];
  const failures = [];
  for (const token of removedTokens) {
    const pattern = new RegExp(`\\b${token}\\b`, 'i');
    if (pattern.test(source)) {
      failures.push({ code: 'UIFN_REMOVED_FRAMEWORK_REFERENCE', path: pathname, framework: token });
    }
  }
  for (const assumption of legacyFrameworkAssumptions) {
    if (assumption.pattern.test(source)) failures.push({ code: assumption.code, path: pathname });
  }
  return failures;
}

export function runCleanVerification(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const failures = [];
  const scanned = [
    'package.json',
    'package-lock.json',
    'release-packages.json',
    ...walk(repoRoot, 'scripts'),
    ...walk(repoRoot, 'uifn'),
  ];

  for (const pathname of [...new Set(scanned)]) {
    if (!existsSync(path.join(repoRoot, pathname))) continue;
    failures.push(...scanRemovedFrameworkReferences(pathname, readFileSync(path.join(repoRoot, pathname), 'utf8')));
  }
  for (const pathname of deletedPaths) {
    if (existsSync(path.join(repoRoot, pathname))) failures.push({ code: 'UIFN_REMOVED_FRAMEWORK_PATH_PRESENT', path: pathname });
  }

  const releases = JSON.parse(readFileSync(path.join(repoRoot, 'release-packages.json'), 'utf8'));
  for (const entry of releases) {
    if (removedTokens.some((token) => entry.name === `@uifn/${token}` || entry.path === `uifn/${token}`)) {
      failures.push({ code: 'UIFN_REMOVED_FRAMEWORK_RELEASE_ROW', package: entry.name, path: entry.path });
    }
  }

  const migration = path.join(repoRoot, 'uifn', 'MIGRATION_REMOVED_FRAMEWORKS.md');
  if (!existsSync(migration)) failures.push({ code: 'UIFN_REMOVED_FRAMEWORK_MIGRATION_MISSING' });
  const historicalRoot = path.join(repoRoot, 'uifn', 'evidence');
  const historicalReferences = walkIncludingConduct(historicalRoot).reduce((count, pathname) => {
    const source = readFileSync(pathname, 'utf8');
    return count + removedTokens.reduce((sum, token) => sum + (source.match(new RegExp(`\\b${token}\\b`, 'gi'))?.length ?? 0), 0);
  }, 0);

  return {
    ok: failures.length === 0,
    command: 'verify:uifn-clean',
    scannedFiles: new Set(scanned).size,
    deletedPaths,
    historicalReferencesPreserved: historicalReferences,
    failures,
  };
}

function walkIncludingConduct(absolute) {
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const pathname = path.join(absolute, entry.name);
    if (entry.isDirectory()) return walkIncludingConduct(pathname);
    return readableExtensions.has(path.extname(entry.name)) ? [pathname] : [];
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runCleanVerification();
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
