#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const graph = JSON.parse(readFileSync(path.join(repoRoot, "mdfn", "package-graph.json"), "utf8"));
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "mdfn-consumers-"));
const packRoot = path.join(tempRoot, "packs");
const failures = [];
const artifactHashes = {};
const commonMdfn = ["@mdfn/core", "@mdfn/markdown", "@mdfn/render", "@mdfn/extensions", "@mdfn/dom", "@mdfn/source", "@mdfn/adapter-kit", "@mdfn/components", "@mdfn/registry", "mdfn"];
const commonUifn = ["@uifn/core", "@uifn/dom", "@uifn/adapter-kit", "@uifn/tokens", "@uifn/theme", "@uifn/recipes", "@uifn/components"];
const consumers = [
  { framework: "react", packages: ["@mdfn/react", "@mdfn/components-react", "@uifn/react", "@uifn/components-react"], peers: { react: "18.3.1", "react-dom": "18.3.1", vite: "5.4.21" } },
  { framework: "svelte", packages: ["@mdfn/svelte", "@mdfn/components-svelte", "@uifn/svelte", "@uifn/components-svelte"], peers: { svelte: "5.46.4", vite: "5.4.21", "@sveltejs/vite-plugin-svelte": "4.0.4" } },
  { framework: "solid", packages: ["@mdfn/solid", "@mdfn/components-solid", "@uifn/solid", "@uifn/components-solid"], peers: { "solid-js": "1.9.13", vite: "5.4.21", "vite-plugin-solid": "2.11.12" } },
];

function run(command, args, cwd) {
  return spawnSync(command, args, { cwd, env: process.env, encoding: "utf8" });
}

function sanitize(value) {
  return String(value).replaceAll(repoRoot, "[REPO]").replaceAll(tempRoot, "[TEMP]").split("\n").slice(-24).join("\n").trim();
}

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function parsePackOutput(stdout) {
  const source = String(stdout).trim();
  for (let index = source.lastIndexOf("["); index >= 0; index = source.lastIndexOf("[", index - 1)) {
    try {
      const parsed = JSON.parse(source.slice(index));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // npm may print package script output before its JSON result.
    }
  }
  return undefined;
}

function pack(packageName) {
  const workspace = graph.stable.find((entry) => entry.name === packageName)?.path ?? packageName;
  const result = run("npm", ["pack", "--workspace", workspace, "--pack-destination", packRoot, "--json"], repoRoot);
  if (result.status !== 0) {
    fail("MDFN_CONSUMER_PACK_FAILED", { package: packageName, stdout: sanitize(result.stdout), stderr: sanitize(result.stderr) });
    return undefined;
  }
  const parsed = parsePackOutput(result.stdout);
  const filename = parsed?.[0]?.filename;
  if (!filename) {
    fail("MDFN_CONSUMER_PACK_OUTPUT_INVALID", { package: packageName, stdout: sanitize(result.stdout) });
    return undefined;
  }
  const pathname = path.join(packRoot, filename);
  artifactHashes[packageName] = createHash("sha256").update(readFileSync(pathname)).digest("hex");
  return pathname;
}

function writeConsumer(consumerRoot, framework) {
  const sourceRoot = path.join(consumerRoot, "src");
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(path.join(consumerRoot, "index.html"), '<main id="app"></main><script type="module" src="/src/main.js"></script>\n');
  if (framework === "react") {
    writeFileSync(path.join(sourceRoot, "main.js"), `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport { createMdfn } from 'mdfn';\nimport { MdfnEditorShell } from '@mdfn/components-react';\nconst controller=createMdfn({markdown:'# Consumer\\n'});\ncreateRoot(document.querySelector('#app')).render(React.createElement(MdfnEditorShell,{controller}));\n`);
    writeFileSync(path.join(consumerRoot, "vite.config.mjs"), "export default { logLevel: 'error' };\n");
    writeFileSync(path.join(sourceRoot, "ssr.js"), `import React from 'react';\nimport { renderToString } from 'react-dom/server';\nimport { createMdfn } from 'mdfn';\nimport { MdfnEditorShell } from '@mdfn/components-react';\nconst html=renderToString(React.createElement(MdfnEditorShell,{controller:createMdfn({markdown:'# SSR\\n'}),mode:'read-only'}));\nif(!html.includes('data-mdfn-component="editor-shell"')) throw new Error('MDFN_REACT_SSR_FAILED');\nexport {html};\n`);
    return;
  }
  if (framework === "svelte") {
    writeFileSync(path.join(sourceRoot, "App.svelte"), `<script>\n  import { createMdfn } from 'mdfn';\n  import { MdfnEditorShell } from '@mdfn/components-svelte';\n  const controller=createMdfn({markdown:'# Consumer\\n'});\n</script>\n<MdfnEditorShell {controller} />\n`);
    writeFileSync(path.join(sourceRoot, "main.js"), "import { mount } from 'svelte';\nimport App from './App.svelte';\nmount(App,{target:document.querySelector('#app')});\n");
    writeFileSync(path.join(consumerRoot, "vite.config.mjs"), "import { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default { logLevel: 'error', plugins: [svelte()] };\n");
    writeFileSync(path.join(sourceRoot, "ssr.js"), `import { render } from 'svelte/server';\nimport { createMdfn } from 'mdfn';\nimport { MdfnEditorShell } from '@mdfn/components-svelte';\nconst {body:html}=render(MdfnEditorShell,{props:{controller:createMdfn({markdown:'# SSR\\n'}),mode:'read-only'}});\nif(!html.includes('data-mdfn-component="editor-shell"')) throw new Error('MDFN_SVELTE_SSR_FAILED');\nexport {html};\n`);
    return;
  }
  writeFileSync(path.join(sourceRoot, "App.tsx"), `import { createMdfn } from 'mdfn';\nimport { MdfnEditorShell } from '@mdfn/components-solid';\nconst controller=createMdfn({markdown:'# Consumer\\n'});\nexport default function App(){return <MdfnEditorShell controller={controller}/>;}\n`);
  writeFileSync(path.join(sourceRoot, "main.tsx"), "import { render } from 'solid-js/web';\nimport App from './App';\nrender(()=><App/>,document.querySelector('#app'));\n");
  writeFileSync(path.join(sourceRoot, "main.js"), "import './main.tsx';\n");
  writeFileSync(path.join(consumerRoot, "vite.config.mjs"), "import solid from 'vite-plugin-solid';\nexport default { logLevel: 'error', plugins: [solid({hot:false})] };\n");
  writeFileSync(path.join(sourceRoot, "ssr.js"), `import { createComponent } from 'solid-js';\nimport { renderToString } from 'solid-js/web';\nimport { createMdfn } from 'mdfn';\nimport { MdfnEditorShell } from '@mdfn/components-solid';\nconst html=renderToString(()=>createComponent(MdfnEditorShell,{controller:createMdfn({markdown:'# SSR\\n'}),mode:'read-only'}));\nif(!html.includes('data-mdfn-component="editor-shell"')) throw new Error('MDFN_SOLID_SSR_FAILED');\nexport {html};\n`);
}

function verifyRuntimeExports(consumerRoot, framework, packageNames) {
  const esmImports = [...packageNames, "@mdfn/extensions/commonmark", "@mdfn/extensions/gfm", "@mdfn/extensions/callout", "@mdfn/extensions/diagram", "@mdfn/extensions/directives"];
  const esm = run(process.execPath, ["--input-type=module", "--eval", `for (const name of ${JSON.stringify(esmImports)}) await import(name);`], consumerRoot);
  if (esm.status !== 0) fail("MDFN_CONSUMER_ESM_EXPORT_FAILED", { framework, stdout: sanitize(esm.stdout), stderr: sanitize(esm.stderr) });

  const requireImports = packageNames.filter((packageName) => {
    const entry = [...graph.stable, ...graph.optional].find((candidate) => candidate.name === packageName);
    if (!entry) return false;
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, entry.path, "package.json"), "utf8"));
    return Boolean(manifest.exports?.["."]?.require);
  });
  if (packageNames.includes("@mdfn/extensions")) requireImports.push("@mdfn/extensions/commonmark", "@mdfn/extensions/gfm", "@mdfn/extensions/callout", "@mdfn/extensions/diagram", "@mdfn/extensions/directives");
  const cjs = run(process.execPath, ["--eval", `for (const name of ${JSON.stringify(requireImports)}) require(name);`], consumerRoot);
  if (cjs.status !== 0) fail("MDFN_CONSUMER_CJS_EXPORT_FAILED", { framework, stdout: sanitize(cjs.stdout), stderr: sanitize(cjs.stderr) });
  return { esm: esm.status === 0, cjs: cjs.status === 0, subpaths: 5 };
}

const tarballs = new Map();
try {
  mkdirSync(packRoot, { recursive: true });
  const packageNames = new Set([...graph.stable.map((entry) => entry.name), ...commonUifn, ...consumers.flatMap((consumer) => consumer.packages.filter((name) => name.startsWith("@uifn/")))]);
  for (const packageName of packageNames) tarballs.set(packageName, pack(packageName));

  const results = [];
  for (const consumer of consumers) {
    const consumerRoot = path.join(tempRoot, consumer.framework);
    mkdirSync(consumerRoot, { recursive: true });
    const localPackages = [...commonMdfn, ...commonUifn, ...consumer.packages];
    const dependencies = Object.fromEntries(localPackages.map((packageName) => [packageName, `file:${tarballs.get(packageName)}`]));
    Object.assign(dependencies, consumer.peers);
    writeFileSync(path.join(consumerRoot, "package.json"), `${JSON.stringify({ name: `mdfn-${consumer.framework}-consumer`, private: true, type: "module", dependencies }, null, 2)}\n`);
    const install = run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], consumerRoot);
    if (install.status !== 0) {
      fail("MDFN_CONSUMER_INSTALL_FAILED", { framework: consumer.framework, stdout: sanitize(install.stdout), stderr: sanitize(install.stderr) });
      continue;
    }
    writeConsumer(consumerRoot, consumer.framework);
    const build = run(process.execPath, [path.join(consumerRoot, "node_modules", "vite", "bin", "vite.js"), "build"], consumerRoot);
    if (build.status !== 0) fail("MDFN_CONSUMER_BUILD_FAILED", { framework: consumer.framework, stdout: sanitize(build.stdout), stderr: sanitize(build.stderr) });
    const ssrBuild = run(process.execPath, [path.join(consumerRoot, "node_modules", "vite", "bin", "vite.js"), "build", "--ssr", "src/ssr.js", "--outDir", "dist-ssr", "--emptyOutDir", "false"], consumerRoot);
    if (ssrBuild.status !== 0) fail("MDFN_CONSUMER_SSR_BUILD_FAILED", { framework: consumer.framework, stdout: sanitize(ssrBuild.stdout), stderr: sanitize(ssrBuild.stderr) });
    const ssrRun = ssrBuild.status === 0 ? run(process.execPath, [path.join(consumerRoot, "dist-ssr", "ssr.js")], consumerRoot) : { status: 1, stdout: "", stderr: "SSR build failed" };
    if (ssrRun.status !== 0) fail("MDFN_CONSUMER_SSR_RUNTIME_FAILED", { framework: consumer.framework, stdout: sanitize(ssrRun.stdout), stderr: sanitize(ssrRun.stderr) });
    const exports = verifyRuntimeExports(consumerRoot, consumer.framework, [...commonMdfn, ...consumer.packages.filter((name) => name.startsWith("@mdfn/"))]);
    const installed = new Set(readdirSync(path.join(consumerRoot, "node_modules")));
    const forbiddenPeers = ["react", "react-dom", "svelte", "solid-js"].filter((peer) => !(peer in consumer.peers));
    for (const peer of forbiddenPeers) if (installed.has(peer)) fail("MDFN_CONSUMER_CROSS_FRAMEWORK_PEER", { framework: consumer.framework, peer });
    results.push({ framework: consumer.framework, packages: consumer.packages.slice(0, 2), productionBuild: build.status === 0, ssrBuild: ssrBuild.status === 0, ssrRuntime: ssrRun.status === 0, runtimeExports: exports, peers: Object.keys(consumer.peers) });
  }

  const result = { ok: failures.length === 0, command: "verify:mdfn-consumers", graphSha256: createHash("sha256").update(JSON.stringify(graph)).digest("hex"), artifactHashes, consumers: results, failures };
  console[result.ok ? "log" : "error"](JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
