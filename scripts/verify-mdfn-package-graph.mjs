#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const graph = JSON.parse(readFileSync(path.join(root, "mdfn/package-graph.json"), "utf8"));
const releases = JSON.parse(readFileSync(path.join(root, "release-packages.json"), "utf8"));
const failures = [];
const nodes = [...(graph.stable ?? []), ...(graph.optional ?? [])];
const byName = new Map(nodes.map((node) => [node.name, node]));
const stableNames = new Set((graph.stable ?? []).map((node) => node.name));
const frameworkPeers = {
  react: { react: ">=18.2.0 <20", "react-dom": ">=18.2.0 <20" },
  svelte: { svelte: ">=5.0.0 <6" },
  solid: { "solid-js": ">=1.8.0 <2" },
};
const allowedLayers = {
  core: [],
  markdown: ["core"],
  render: ["core"],
  extensions: ["core"],
  browser: ["core", "markdown", "render"],
  "adapter-kit": ["core"],
  adapter: ["core", "browser", "adapter-kit"],
  components: ["core"],
  "components-adapter": ["core", "adapter", "components"],
  testing: ["core", "markdown", "render"],
  registry: ["core"],
  facade: ["core", "markdown", "render", "extensions"],
  platform: ["core", "markdown"],
  bridge: ["core", "render"],
};

function fail(code, detail = {}) { failures.push({ code, ...detail }); }
function json(value) { return JSON.stringify(value); }
function packageName(specifier) {
  if (specifier === "mdfn" || specifier.startsWith("mdfn/")) return "@mdfn/facade";
  const scoped = /^(@mdfn\/[^/]+)(?:\/.*)?$/.exec(specifier);
  return scoped?.[1] ?? null;
}
function externalPackageName(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}
function files(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const absolute = path.join(directory, entry);
    return statSync(absolute).isDirectory() && !["dist", "node_modules", ".conduct"].includes(entry) ? files(absolute) : [absolute];
  });
}
function sourceFiles(node) {
  return files(path.join(root, node.path, "src")).filter((file) => /\.(?:[cm]?[jt]sx?|svelte)$/.test(file) && !/\.(?:test|spec)\./.test(file));
}
function importsFrom(source, fileName) {
  const imports = new Set(ts.preProcessFile(source, true, true).importedFiles.map((entry) => entry.fileName));
  const patterns = [
    /(?:import|export)\s+(?:[^"']*?\s+from\s*)?["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) if (match[1]) imports.add(match[1]);
  return [...imports].map((specifier) => ({ file: path.relative(root, fileName), specifier }));
}
function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(exportTargets);
}
function sourceEntryExists(node, exportKey) {
  if (exportKey.endsWith(".css")) return existsSync(path.join(root, node.path, exportKey.slice(2)));
  const base = exportKey === "." ? "index" : exportKey.replace(/^\.\//, "");
  return [".ts", ".tsx", ".js", ".jsx", ".svelte"].some((extension) => existsSync(path.join(root, node.path, "src", `${base}${extension}`)));
}
function checkLayerEdge(from, to, report = fail) {
  if (!(allowedLayers[from.layer] ?? []).includes(to.layer)) report("MDFN_GRAPH_LAYER_EDGE_FORBIDDEN", { package: from.name, layer: from.layer, dependency: to.name, dependencyLayer: to.layer });
}
function checkExactInternalVersion(owner, section, dependency, actual, expected, report = fail) {
  if (actual !== expected) report("MDFN_GRAPH_INTERNAL_VERSION_MISMATCH", { package: owner, section, dependency, expected, actual });
}
function checkFrameworkPlacement(node, manifest, report = fail) {
  const framework = node.name.match(/(?:components-)?(react|svelte|solid)$/)?.[1];
  const peers = manifest.peerDependencies ?? {};
  if (!framework) {
    if (Object.keys(peers).some((name) => ["react", "react-dom", "svelte", "solid-js"].includes(name))) report("MDFN_GRAPH_FRAMEWORK_PEER_MISPLACED", { package: node.name });
    if (manifest.mdfn?.framework !== undefined) report("MDFN_GRAPH_FRAMEWORK_METADATA_MISPLACED", { package: node.name });
    return;
  }
  const expected = frameworkPeers[framework];
  if (json(peers) !== json(expected)) report("MDFN_GRAPH_FRAMEWORK_PEERS_INVALID", { package: node.name, expected, actual: peers });
  if (manifest.mdfn?.framework !== framework) report("MDFN_GRAPH_FRAMEWORK_METADATA_INVALID", { package: node.name, expected: framework, actual: manifest.mdfn?.framework });
  for (const peer of Object.keys(expected)) {
    if (manifest.dependencies?.[peer]) report("MDFN_GRAPH_FRAMEWORK_RUNTIME_DEPENDENCY", { package: node.name, dependency: peer });
    if (!manifest.devDependencies?.[peer]) report("MDFN_GRAPH_FRAMEWORK_DEV_DEPENDENCY_MISSING", { package: node.name, dependency: peer });
  }
}
function hasExport(manifest, specifier, targetName) {
  const suffix = specifier.slice(targetName.length);
  const key = suffix ? `.${suffix}` : ".";
  return Object.hasOwn(manifest.exports ?? {}, key);
}

if (graph.schemaVersion !== 1 || graph.graphId !== "mdfn-1.0-dag") fail("MDFN_GRAPH_SCHEMA_INVALID");
if (json(graph.frameworks) !== json(["react", "svelte", "solid"])) fail("MDFN_GRAPH_FRAMEWORK_SET_INVALID");
if (nodes.length !== 24 || stableNames.size !== 17) fail("MDFN_GRAPH_PACKAGE_COUNT_INVALID", { total: nodes.length, stable: stableNames.size });
if (byName.size !== nodes.length) fail("MDFN_GRAPH_DUPLICATE_PACKAGE");
if (Object.keys(allowedLayers).some((layer) => !nodes.some((node) => node.layer === layer))) fail("MDFN_GRAPH_LAYER_UNUSED");

const discovered = readdirSync(path.join(root, "mdfn"))
  .map((entry) => path.join(root, "mdfn", entry, "package.json"))
  .filter(existsSync)
  .map((file) => JSON.parse(readFileSync(file, "utf8")).name)
  .sort();
if (json(discovered) !== json([...byName.keys()].sort())) fail("MDFN_GRAPH_INVENTORY_MISMATCH", { expected: [...byName.keys()].sort(), actual: discovered });

const manifests = new Map();
const dependencies = new Map();
for (const node of nodes) {
  const manifestPath = path.join(root, node.path, "package.json");
  if (!existsSync(manifestPath)) { fail("MDFN_GRAPH_PACKAGE_MISSING", { package: node.name }); continue; }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifests.set(node.name, manifest);
  if (manifest.name !== node.name) fail("MDFN_GRAPH_NAME_MISMATCH", { package: node.name, actual: manifest.name });
  if (manifest.version !== "0.1.0") fail("MDFN_GRAPH_VERSION_INVALID", { package: node.name, actual: manifest.version });
  if (manifest.private === true) fail("MDFN_GRAPH_PRIVATE_PACKAGE", { package: node.name });
  const expectedStatus = stableNames.has(node.name) ? "stable-candidate" : "optional";
  const requiredMetadata = {
    type: "module",
    license: "MIT",
    engines: { node: ">=20 <25" },
    repository: { type: "git", url: "git+https://github.com/21nCo/super-functions.git", directory: node.path },
    publishConfig: { access: "public" },
    mdfn: { status: expectedStatus, layer: node.layer, schemaVersion: 1 },
  };
  for (const [key, expected] of Object.entries(requiredMetadata)) {
    const actual = key === "mdfn" ? { status: manifest.mdfn?.status, layer: manifest.mdfn?.layer, schemaVersion: manifest.mdfn?.schemaVersion } : manifest[key];
    if (json(actual) !== json(expected)) fail("MDFN_GRAPH_METADATA_INVALID", { package: node.name, field: key, expected, actual });
  }
  if (!manifest.description?.trim()) fail("MDFN_GRAPH_DESCRIPTION_MISSING", { package: node.name });
  if (!Array.isArray(manifest.files) || !manifest.files.includes("dist") || !manifest.files.includes("README.md")) fail("MDFN_GRAPH_FILES_INVALID", { package: node.name });
  for (const script of ["build", "test", "typecheck", "lint", "prepack"]) if (!manifest.scripts?.[script]) fail("MDFN_GRAPH_SCRIPT_MISSING", { package: node.name, script });
  if (!manifest.exports || !Object.hasOwn(manifest.exports, ".")) fail("MDFN_GRAPH_ROOT_EXPORT_MISSING", { package: node.name });
  for (const [exportKey, descriptor] of Object.entries(manifest.exports ?? {})) {
    if (!sourceEntryExists(node, exportKey)) fail("MDFN_GRAPH_EXPORT_SOURCE_MISSING", { package: node.name, export: exportKey });
    for (const target of exportTargets(descriptor)) {
      if (!target.startsWith("./") || target.includes("..")) fail("MDFN_GRAPH_EXPORT_TARGET_INVALID", { package: node.name, export: exportKey, target });
      const top = target.slice(2).split("/")[0];
      if (!manifest.files.includes(top)) fail("MDFN_GRAPH_EXPORT_TARGET_UNPUBLISHED", { package: node.name, export: exportKey, target });
    }
  }
  const actual = Object.keys(manifest.dependencies ?? {}).filter((name) => name === "@mdfn/facade" || name.startsWith("@mdfn/")).sort();
  const expected = [...node.dependencies].sort();
  dependencies.set(node.name, actual);
  if (json(actual) !== json(expected)) fail("MDFN_GRAPH_EDGE_MISMATCH", { package: node.name, expected, actual });
  for (const dependency of actual) {
    const target = byName.get(dependency);
    if (!target) fail("MDFN_GRAPH_DEPENDENCY_UNKNOWN", { package: node.name, dependency });
    else {
      checkLayerEdge(node, target);
      if (stableNames.has(node.name) && !stableNames.has(dependency)) fail("MDFN_GRAPH_STABLE_TO_OPTIONAL_EDGE", { package: node.name, dependency });
    }
  }
  for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    for (const [dependency, range] of Object.entries(manifest[section] ?? {})) {
      const target = manifests.get(dependency) ?? (byName.has(dependency) ? JSON.parse(readFileSync(path.join(root, byName.get(dependency).path, "package.json"), "utf8")) : null);
      if (target) checkExactInternalVersion(node.name, section, dependency, range, target.version);
    }
  }
  checkFrameworkPlacement(node, manifest);
  if (node.layer === "components-adapter" && manifest.mdfn?.chromeOwner !== "uifn") fail("MDFN_GRAPH_CHROME_OWNER_INVALID", { package: node.name });
  if (node.layer !== "components-adapter" && manifest.mdfn?.chromeOwner !== undefined) fail("MDFN_GRAPH_CHROME_OWNER_MISPLACED", { package: node.name });
  const expectedKernel = node.name === "@mdfn/dom" ? "prosemirror" : node.name === "@mdfn/source" ? "codemirror" : undefined;
  if (manifest.mdfn?.kernel !== expectedKernel) fail("MDFN_GRAPH_KERNEL_METADATA_INVALID", { package: node.name, expected: expectedKernel, actual: manifest.mdfn?.kernel });
}

for (const node of nodes) {
  const manifest = manifests.get(node.name);
  if (!manifest) continue;
  const declared = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}), ...(manifest.optionalDependencies ?? {}) };
  for (const file of sourceFiles(node)) {
    const source = readFileSync(file, "utf8");
    for (const entry of importsFrom(source, file)) {
      const specifier = entry.specifier;
      if (specifier.startsWith(".") || specifier.startsWith("/")) continue;
      if (specifier.startsWith("node:")) {
        if (["core", "markdown", "render", "extensions", "testing", "registry", "facade"].includes(node.layer)) fail("MDFN_GRAPH_ENVIRONMENT_LEAK", { package: node.name, ...entry });
        continue;
      }
      const targetName = packageName(specifier);
      if (targetName) {
        const target = manifests.get(targetName);
        if (!target) { fail("MDFN_GRAPH_IMPORT_TARGET_UNKNOWN", { package: node.name, ...entry }); continue; }
        if (targetName !== node.name && !Object.hasOwn(manifest.dependencies ?? {}, targetName)) fail("MDFN_GRAPH_INTERNAL_IMPORT_UNDECLARED", { package: node.name, ...entry });
        if (/\/(?:src|dist|internal)(?:\/|$)/.test(specifier)) fail("MDFN_GRAPH_PRIVATE_DEEP_IMPORT", { package: node.name, ...entry });
        if (!hasExport(target, specifier, targetName)) fail("MDFN_GRAPH_UNEXPORTED_DEEP_IMPORT", { package: node.name, ...entry });
      } else {
        const external = externalPackageName(specifier);
        if (!Object.hasOwn(declared, external)) fail("MDFN_GRAPH_EXTERNAL_IMPORT_UNDECLARED", { package: node.name, ...entry, dependency: external });
      }
      const framework = node.name.match(/(?:components-)?(react|svelte|solid)$/)?.[1];
      for (const other of ["react", "svelte", "solid"]) {
        const otherPackage = other === "solid" ? "solid-js" : other;
        if (other !== framework && (specifier === otherPackage || specifier.startsWith(`@mdfn/${other}`) || specifier.startsWith(`@mdfn/components-${other}`))) fail("MDFN_GRAPH_FRAMEWORK_LEAK", { package: node.name, framework: other, ...entry });
      }
      if (["core", "markdown", "render", "extensions", "testing", "registry", "facade"].includes(node.layer) && ["react", "react-dom", "svelte", "solid-js"].includes(externalPackageName(specifier))) fail("MDFN_GRAPH_ENVIRONMENT_LEAK", { package: node.name, ...entry });
    }
  }
}

const visiting = new Set();
const visited = new Set();
function visit(name, trail = []) {
  if (visiting.has(name)) { fail("MDFN_GRAPH_CYCLE", { path: [...trail, name] }); return; }
  if (visited.has(name)) return;
  visiting.add(name);
  for (const dependency of dependencies.get(name) ?? []) visit(dependency, [...trail, name]);
  visiting.delete(name);
  visited.add(name);
}
for (const name of byName.keys()) visit(name);

for (const node of nodes) {
  const matches = releases.filter((entry) => entry.name === node.name && entry.path === node.path);
  if (matches.length !== 1) fail("MDFN_GRAPH_RELEASE_ROW_INVALID", { package: node.name, matches: matches.length });
}
if (releases.some((entry) => entry.name?.startsWith("@mdfn/") && !byName.has(entry.name))) fail("MDFN_GRAPH_RELEASE_ROW_UNKNOWN");
if (nodes.filter((node) => node.layer === "facade").length !== 1 || byName.get("@mdfn/facade")?.layer !== "facade") fail("MDFN_GRAPH_FACADE_INVALID");

// Negative controls keep the rules executable: each forbidden fixture must be rejected.
const negativeControls = [];
const capture = (code) => (actual) => { if (actual === code) negativeControls.push(code); };
checkLayerEdge({ name: "fixture-core", layer: "core" }, { name: "fixture-browser", layer: "browser" }, capture("MDFN_GRAPH_LAYER_EDGE_FORBIDDEN"));
checkExactInternalVersion("fixture", "dependencies", "@mdfn/core", "^0.1.0", "0.1.0", capture("MDFN_GRAPH_INTERNAL_VERSION_MISMATCH"));
checkFrameworkPlacement({ name: "@mdfn/react" }, { peerDependencies: { react: "*" }, dependencies: { react: "18" }, devDependencies: {}, mdfn: { framework: "react" } }, capture("MDFN_GRAPH_FRAMEWORK_PEERS_INVALID"));
for (const required of ["MDFN_GRAPH_LAYER_EDGE_FORBIDDEN", "MDFN_GRAPH_INTERNAL_VERSION_MISMATCH", "MDFN_GRAPH_FRAMEWORK_PEERS_INVALID"]) if (!negativeControls.includes(required)) fail("MDFN_GRAPH_SELF_TEST_FAILED", { expected: required });

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, graphId: graph.graphId, stable: graph.stable.length, optional: graph.optional.length, frameworks: graph.frameworks, negativeControls: negativeControls.length }));
