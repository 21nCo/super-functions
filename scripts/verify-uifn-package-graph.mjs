#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const defaultRepoRoot = process.cwd();
const ignoredDirectories = new Set([
  '.conduct', '.next', '.nuxt', '.output', '.svelte-kit', '.vite', '.vite-vitest',
  'build', 'coverage', 'dist', 'node_modules', 'out',
]);
const sourceExtensions = new Set(['.cjs', '.js', '.jsx', '.mjs', '.mts', '.svelte', '.ts', '.tsx']);

function issue(code, detail = {}) {
  return { code, ...detail };
}

function readJson(repoRoot, pathname) {
  return JSON.parse(readFileSync(path.join(repoRoot, pathname), 'utf8'));
}

function unique(values) {
  return [...new Set(values)];
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated];
}

function walk(root, relative, predicate) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const pathname = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : walk(root, pathname, predicate);
    }
    return predicate(pathname) ? [pathname] : [];
  });
}

function packageFiles(repoRoot) {
  return walk(repoRoot, 'uifn', (pathname) => pathname.endsWith('/package.json'));
}

function sourceFiles(repoRoot, packagePath) {
  return walk(repoRoot, path.posix.join(packagePath, 'src'), (pathname) => sourceExtensions.has(path.extname(pathname)));
}

function normalizeGraphForHash(graph) {
  return JSON.stringify(graph);
}

function graphHash(graph) {
  return createHash('sha256').update(normalizeGraphForHash(graph)).digest('hex');
}

function actualDependencies(node, manifest) {
  if (Array.isArray(node.fixtureDependencies)) return [...node.fixtureDependencies];
  return Object.keys(manifest?.dependencies ?? {}).filter((dependency) => dependency.startsWith('@uifn/')).sort();
}

function findCycles(nodes, dependenciesByName) {
  const nodeNames = new Set(nodes.map((node) => node.name));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const cycles = [];

  function visit(name) {
    if (visiting.has(name)) {
      const start = stack.indexOf(name);
      cycles.push([...stack.slice(start), name]);
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    stack.push(name);
    for (const dependency of dependenciesByName.get(name) ?? []) {
      if (nodeNames.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(name);
    visited.add(name);
  }

  for (const node of nodes) visit(node.name);
  return cycles;
}

function validateGraphShape(graph) {
  const failures = [];
  if (graph?.schemaVersion !== 1 || graph?.graphId !== 'uifn-1.0-stable-dag') {
    failures.push(issue('UIFN_PACKAGE_GRAPH_SCHEMA_INVALID'));
    return failures;
  }
  if (JSON.stringify(graph.stableFrameworks) !== JSON.stringify(['react', 'svelte', 'solid'])) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_FRAMEWORK_SET_INVALID', { actual: graph.stableFrameworks }));
  }
  if (!Array.isArray(graph.stable) || graph.stable.length !== 16) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_STABLE_COUNT_INVALID', { actual: graph.stable?.length ?? null }));
  }
  if (!Array.isArray(graph.experimental) || graph.experimental.length !== 2) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_EXPERIMENTAL_COUNT_INVALID', { actual: graph.experimental?.length ?? null }));
  }
  const nodes = [...(graph.stable ?? []), ...(graph.experimental ?? [])];
  for (const duplicate of duplicates(nodes.map((node) => node.name))) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_DUPLICATE_PACKAGE', { package: duplicate }));
  }
  for (const duplicate of duplicates(nodes.map((node) => node.path))) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_DUPLICATE_PATH', { path: duplicate }));
  }
  for (const node of nodes) {
    if (!node.name?.startsWith('@uifn/') || !node.path?.startsWith('uifn/') || !node.layer) {
      failures.push(issue('UIFN_PACKAGE_GRAPH_NODE_INVALID', { package: node.name ?? null }));
    }
    if (!node.owner) failures.push(issue('UIFN_PACKAGE_GRAPH_OWNER_MISSING', { package: node.name ?? null }));
    if (!Array.isArray(node.allowedDependencies) || !Array.isArray(node.allowedPeerDependencies) || !Array.isArray(node.publicEntrypoints)) {
      failures.push(issue('UIFN_PACKAGE_GRAPH_NODE_INVALID', { package: node.name ?? null }));
    }
  }
  return failures;
}

function validateNodeEdges(nodes, stableNames, privateNames, manifests, inspectWorktree) {
  const failures = [];
  const dependenciesByName = new Map();
  const publicNames = new Set(nodes.map((node) => node.name));

  for (const node of nodes) {
    const manifest = manifests.get(node.name);
    const dependencies = actualDependencies(node, manifest);
    dependenciesByName.set(node.name, dependencies);
    const allowed = new Set(node.allowedDependencies ?? []);
    for (const dependency of dependencies) {
      if (!allowed.has(dependency)) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_FORBIDDEN_EDGE', { package: node.name, dependency, path: [node.name, dependency] }));
      }
      if (stableNames.has(node.name) && (!stableNames.has(dependency) || privateNames.has(dependency))) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_FORBIDDEN_EDGE', { package: node.name, dependency, path: [node.name, dependency], reason: 'stable-to-nonstable' }));
      }
      if (!publicNames.has(dependency)) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_UNDECLARED_DEPENDENCY', { package: node.name, dependency }));
      }
    }
    if (inspectWorktree) {
      for (const required of node.allowedDependencies ?? []) {
        if (!dependencies.includes(required)) {
          failures.push(issue('UIFN_PACKAGE_GRAPH_REQUIRED_EDGE_MISSING', { package: node.name, dependency: required }));
        }
      }
    }
  }

  for (const cycle of findCycles(nodes, dependenciesByName)) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_CYCLE', { path: cycle }));
  }
  return { failures, dependenciesByName };
}

function validateManifestNode(repoRoot, node, expectedStatus, ownershipIds) {
  const failures = [];
  const packageFile = `${node.path}/package.json`;
  if (!existsSync(path.join(repoRoot, packageFile))) {
    failures.push(issue('UIFN_PACKAGE_GRAPH_PACKAGE_MISSING', { package: node.name, path: packageFile }));
    return { failures, manifest: undefined };
  }
  const manifest = readJson(repoRoot, packageFile);
  if (manifest.name !== node.name) failures.push(issue('UIFN_PACKAGE_GRAPH_NAME_MISMATCH', { package: node.name, actual: manifest.name }));
  if (manifest.private === true) failures.push(issue('UIFN_PACKAGE_GRAPH_PUBLIC_MARKED_PRIVATE', { package: node.name }));
  if (manifest.uifn?.status !== expectedStatus) failures.push(issue('UIFN_PACKAGE_GRAPH_STATUS_MISMATCH', { package: node.name, expected: expectedStatus, actual: manifest.uifn?.status ?? null }));
  if (manifest.uifn?.layer !== node.layer) failures.push(issue('UIFN_PACKAGE_GRAPH_LAYER_MISMATCH', { package: node.name, expected: node.layer, actual: manifest.uifn?.layer ?? null }));
  if (manifest.uifn?.sourcePolicy !== 'clean-room') failures.push(issue('UIFN_PACKAGE_GRAPH_SOURCE_POLICY_INVALID', { package: node.name }));
  if (!ownershipIds.has(node.name) || !node.owner) failures.push(issue('UIFN_PACKAGE_GRAPH_OWNER_MISSING', { package: node.name }));
  for (const entrypoint of node.publicEntrypoints ?? []) {
    if (!manifest.exports || !Object.hasOwn(manifest.exports, entrypoint)) {
      failures.push(issue('UIFN_PACKAGE_GRAPH_PUBLIC_ENTRYPOINT_MISSING', { package: node.name, entrypoint }));
    }
  }
  const peers = Object.keys(manifest.peerDependencies ?? {}).sort();
  const allowedPeers = new Set(node.allowedPeerDependencies ?? []);
  for (const peer of peers) {
    if (!allowedPeers.has(peer)) failures.push(issue('UIFN_PACKAGE_GRAPH_FORBIDDEN_PEER', { package: node.name, peer }));
  }
  for (const peer of allowedPeers) {
    if (!peers.includes(peer)) failures.push(issue('UIFN_PACKAGE_GRAPH_REQUIRED_PEER_MISSING', { package: node.name, peer }));
  }
  if (expectedStatus === 'experimental') {
    if (manifest.publishConfig?.tag !== 'experimental' || manifest.uifn?.releaseLane !== 'experimental' || manifest.uifn?.stableBlocking !== false || manifest.uifn?.versionPolicy !== 'independent') {
      failures.push(issue('UIFN_PACKAGE_GRAPH_EXPERIMENTAL_POLICY_INVALID', { package: node.name }));
    }
  } else if (manifest.publishConfig?.tag === 'experimental') {
    failures.push(issue('UIFN_PACKAGE_GRAPH_STABLE_TAG_INVALID', { package: node.name }));
  }
  return { failures, manifest };
}

function validateSourceImports(repoRoot, node, allowedDependencies) {
  const failures = [];
  const allowed = new Set(allowedDependencies);
  for (const pathname of sourceFiles(repoRoot, node.path)) {
    const source = readFileSync(path.join(repoRoot, pathname), 'utf8');
    for (const dependency of sourceImportSpecifiers(source, pathname)) {
      if (dependency !== node.name && !allowed.has(dependency)) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_FORBIDDEN_EDGE', { package: node.name, dependency, path: [pathname, dependency], reason: 'source-import' }));
      }
    }
  }
  return failures;
}

function sourceImportSpecifiers(source, pathname) {
  const extension = path.extname(pathname);
  const executableSources = extension === '.svelte'
    ? [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
    : [source];
  const dependencies = new Set();

  for (const executableSource of executableSources) {
    const scriptKind = ['.jsx', '.tsx'].includes(extension) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(pathname, executableSource, ts.ScriptTarget.Latest, false, scriptKind);
    const visit = (node) => {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
        specifier = node.moduleSpecifier;
      } else if (
        ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
      ) {
        specifier = node.moduleReference.expression;
      } else if (
        ts.isCallExpression(node)
        && (
          node.expression.kind === ts.SyntaxKind.ImportKeyword
          || (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        )
      ) {
        specifier = node.arguments[0];
      }
      if (specifier && ts.isStringLiteralLike(specifier)) {
        const match = /^(@uifn\/[^/]+)/.exec(specifier.text);
        if (match) dependencies.add(match[1]);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return dependencies;
}

export function runPackageGraphVerification(options = {}) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const graph = options.graph ?? readJson(repoRoot, 'uifn/package-graph.json');
  const inspectWorktree = options.inspectWorktree ?? true;
  const stableOnly = options.stableOnly ?? false;
  const failures = [...validateGraphShape(graph)];
  const stableNodes = graph.stable ?? [];
  const experimentalNodes = graph.experimental ?? [];
  const nodes = stableOnly ? stableNodes : [...stableNodes, ...experimentalNodes];
  const stableNames = new Set(stableNodes.map((node) => node.name));
  const experimentalNames = new Set(experimentalNodes.map((node) => node.name));
  const privateNames = new Set((graph.private ?? []).map((node) => node.name));
  const ownershipIds = inspectWorktree
    ? new Set(readJson(repoRoot, 'uifn/evidence/contracts/ownership.json').packages.map((entry) => entry.id))
    : new Set(nodes.map((node) => node.name));
  const manifests = new Map();

  if (inspectWorktree) {
    for (const node of stableNodes) {
      const result = validateManifestNode(repoRoot, node, 'ga-candidate', ownershipIds);
      failures.push(...result.failures);
      if (result.manifest) manifests.set(node.name, result.manifest);
      failures.push(...validateSourceImports(repoRoot, node, node.allowedDependencies ?? []));
    }
    if (!stableOnly) {
      for (const node of experimentalNodes) {
        const result = validateManifestNode(repoRoot, node, 'experimental', ownershipIds);
        failures.push(...result.failures);
        if (result.manifest) manifests.set(node.name, result.manifest);
        failures.push(...validateSourceImports(repoRoot, node, node.allowedDependencies ?? []));
      }
    }

    const declaredPublic = new Set([...stableNames, ...experimentalNames]);
    const declaredPrivate = new Map((graph.private ?? []).map((node) => [node.name, node.path]));
    for (const packageFile of packageFiles(repoRoot)) {
      const manifest = readJson(repoRoot, packageFile);
      if (!manifest.name?.startsWith('@uifn/')) continue;
      const packagePath = path.posix.dirname(packageFile);
      if (manifest.private === true) {
        if (!declaredPrivate.has(manifest.name) || declaredPrivate.get(manifest.name) !== packagePath) {
          failures.push(issue('UIFN_PACKAGE_GRAPH_UNDECLARED_PRIVATE_WORKSPACE', { package: manifest.name, path: packagePath }));
        }
      } else if (!declaredPublic.has(manifest.name)) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_UNDECLARED_PACKAGE', { package: manifest.name, path: packagePath }));
      }
    }
    for (const privateNode of graph.private ?? []) {
      const packageFile = `${privateNode.path}/package.json`;
      if (!existsSync(path.join(repoRoot, packageFile))) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_PRIVATE_WORKSPACE_MISSING', { package: privateNode.name, path: packageFile }));
        continue;
      }
      const manifest = readJson(repoRoot, packageFile);
      if (manifest.name !== privateNode.name || manifest.private !== true) {
        failures.push(issue('UIFN_PACKAGE_GRAPH_PRIVATE_WORKSPACE_INVALID', { package: privateNode.name, path: packageFile }));
      }
    }
    const rootPackage = readJson(repoRoot, 'package.json');
    for (const workspace of ['uifn/*', 'uifn/catalogs/*', 'uifn/examples/*']) {
      if (!rootPackage.workspaces?.includes(workspace)) failures.push(issue('UIFN_PACKAGE_GRAPH_WORKSPACE_PATTERN_MISSING', { workspace }));
    }
    const releaseRows = readJson(repoRoot, 'release-packages.json').filter((entry) => entry.name?.startsWith('@uifn/'));
    const releaseNames = new Set(releaseRows.map((entry) => entry.name));
    for (const packageName of stableNames) {
      if (!releaseNames.has(packageName)) failures.push(issue('UIFN_PACKAGE_GRAPH_RELEASE_ROW_MISSING', { package: packageName }));
    }
    for (const row of releaseRows) {
      if (!stableNames.has(row.name)) failures.push(issue('UIFN_PACKAGE_GRAPH_RELEASE_ROW_FORBIDDEN', { package: row.name, path: row.path }));
    }
  } else {
    for (const node of nodes) manifests.set(node.name, { dependencies: Object.fromEntries((node.fixtureDependencies ?? node.allowedDependencies ?? []).map((dependency) => [dependency, '*'])) });
  }

  const edgeResult = validateNodeEdges(nodes, stableNames, privateNames, manifests, inspectWorktree);
  failures.push(...edgeResult.failures);

  return {
    ok: failures.length === 0,
    command: 'verify-uifn-package-graph',
    schemaVersion: 1,
    graphId: graph.graphId,
    graphSha256: graphHash(graph),
    mode: stableOnly ? 'stable-only' : 'full',
    stableFrameworks: graph.stableFrameworks,
    packages: {
      stable: stableNodes.map((node) => node.name),
      experimental: experimentalNodes.map((node) => node.name),
      private: (graph.private ?? []).map((node) => node.name),
    },
    cycles: failures.filter((entry) => entry.code === 'UIFN_PACKAGE_GRAPH_CYCLE').map((entry) => entry.path),
    failures,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const stableOnly = process.argv.includes('--stable-only');
  const result = runPackageGraphVerification({ stableOnly });
  const output = JSON.stringify(result, null, 2);
  if (result.ok) console.log(output);
  else console.error(output);
  process.exit(result.ok ? 0 : 1);
}
