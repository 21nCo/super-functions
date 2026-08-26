#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 22) {
  console.error(
    JSON.stringify({
      ok: false,
      error: `npm run gate:mcpfn-release requires Node.js 22 or newer for the official conformance runner; current runtime is ${process.versions.node}`,
    }),
  );
  process.exit(1);
}

const temporaryRoot = mkdtempSync(path.join(tmpdir(), "mcpfn-release-"));
const candidateManifest = path.join(temporaryRoot, "calculator.manifest.json");
const scenarioReport = path.join(temporaryRoot, "calculator.report.json");
const results = [];

function run(name, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      PATH: [path.dirname(process.execPath), process.env.PATH]
        .filter(Boolean)
        .join(path.delimiter),
    },
    stdio: "pipe",
    encoding: "utf8",
    shell: false,
  });
  const record = {
    name,
    command: [command, ...args].join(" "),
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
  };
  results.push(record);
  if (!record.ok) {
    throw new Error(
      `${name} failed with ${record.status}\n${record.stdout}\n${record.stderr}`,
    );
  }
  return record;
}

function npmStep(name, args, options) {
  return run(name, process.platform === "win32" ? "npm.cmd" : "npm", args, options);
}

function verifyDocumentation() {
  const files = [
    "mcpfn/README.md",
    "mcpfn/ARCHITECTURE.md",
    "mcpfn/TESTING.md",
    "mcpfn/MIGRATION.md",
    "mcpfn/core/README.md",
    "mcpfn/auth/README.md",
    "mcpfn/testing/README.md",
    "mcpfn/datafn/README.md",
    "mcpfn/cli/README.md",
  ];
  const missing = [];
  const absolutePaths = [];
  const placeholderFiles = [];
  let gateMentions = 0;
  for (const file of files) {
    let source;
    try {
      source = readFileSync(path.join(repoRoot, file), "utf8");
    } catch {
      missing.push(file);
      continue;
    }
    if (/\/Users\/|\/home\/|[A-Za-z]:\\Users\\/.test(source)) {
      absolutePaths.push(file);
    }
    if (/\b(?:TODO|FIXME|coming soon|placeholder|scaffold)\b/i.test(source)) {
      placeholderFiles.push(file);
    }
    if (source.includes("npm run gate:mcpfn-release")) gateMentions += 1;
  }
  const ok =
    missing.length === 0 &&
    absolutePaths.length === 0 &&
    placeholderFiles.length === 0 &&
    gateMentions >= 2;
  results.push({
    name: "documentation",
    command: "internal documentation inventory",
    ok,
    status: ok ? 0 : 1,
    stdout: JSON.stringify({ files, missing, absolutePaths, placeholderFiles, gateMentions }),
    stderr: "",
  });
  if (!ok) throw new Error("McpFn documentation inventory failed");
}

function verifyPackage(packagePath) {
  const result = npmStep(
    `pack:${packagePath}`,
    ["pack", "--dry-run", "--json"],
    { cwd: path.join(repoRoot, packagePath) },
  );
  const packed = JSON.parse(result.stdout)[0];
  const files = new Set(packed.files.map((entry) => entry.path));
  const requiredFiles = ["README.md", "dist/index.js", "dist/index.cjs", "dist/index.d.ts"];
  if (packagePath === "mcpfn/testing") {
    requiredFiles.push(
      "dist/auth.js",
      "dist/auth.cjs",
      "dist/auth.d.ts",
      "dist/playwright.js",
      "dist/playwright.cjs",
      "dist/playwright.d.ts",
    );
  }
  if (packagePath === "mcpfn/cli") requiredFiles.push("dist/bin.js");
  for (const required of requiredFiles) {
    if (!files.has(required)) {
      throw new Error(`${packagePath} package is missing ${required}`);
    }
  }
  if (packagePath === "mcpfn/cli") {
    const bin = packed.files.find((entry) => entry.path === "dist/bin.js");
    if (!bin || (bin.mode & 0o111) === 0) {
      throw new Error("mcpfn/cli package bin is not executable");
    }
  }
}

try {
  npmStep("core:typecheck", ["run", "typecheck", "--workspace", "@mcpfn/core"]);
  npmStep("core:test", ["run", "test", "--workspace", "@mcpfn/core"]);
  npmStep("core:build", ["run", "build", "--workspace", "@mcpfn/core"]);

  npmStep("auth:typecheck", ["run", "typecheck", "--workspace", "@mcpfn/auth"]);
  npmStep("auth:test", ["run", "test", "--workspace", "@mcpfn/auth"]);
  npmStep("auth:build", ["run", "build", "--workspace", "@mcpfn/auth"]);

  npmStep("testing:typecheck", ["run", "typecheck", "--workspace", "@mcpfn/testing"]);
  npmStep("testing:test", ["run", "test", "--workspace", "@mcpfn/testing"]);
  npmStep("testing:playwright", ["run", "test:playwright", "--workspace", "@mcpfn/testing"]);
  npmStep("testing:build", ["run", "build", "--workspace", "@mcpfn/testing"]);

  for (const workspace of [
    "@datafn/core",
    "@superfunctions/observability",
    "@superfunctions/db",
    "@superfunctions/http",
  ]) {
    npmStep(`dependency:build:${workspace}`, ["run", "build", "--workspace", workspace]);
  }
  npmStep("datafn-server:typecheck", ["run", "typecheck", "--workspace", "@datafn/server"]);
  npmStep("datafn-server:test", ["run", "test", "--workspace", "@datafn/server"]);
  npmStep("datafn-server:build", ["run", "build", "--workspace", "@datafn/server"]);

  npmStep("datafn:typecheck", ["run", "typecheck", "--workspace", "@mcpfn/datafn"]);
  npmStep("datafn:test", ["run", "test", "--workspace", "@mcpfn/datafn"]);
  npmStep("datafn:build", ["run", "build", "--workspace", "@mcpfn/datafn"]);

  npmStep("cli:typecheck", ["run", "typecheck", "--workspace", "@mcpfn/cli"]);
  npmStep("cli:test", ["run", "test", "--workspace", "@mcpfn/cli"]);
  npmStep("cli:build", ["run", "build", "--workspace", "@mcpfn/cli"]);

  run("example:manifest", process.execPath, [
    "mcpfn/cli/dist/bin.js", "manifest", "mcpfn/examples/calculator-server.ts", "--output", candidateManifest,
  ]);
  run("example:validate", process.execPath, [
    "mcpfn/cli/dist/bin.js", "validate", "mcpfn/examples/calculator.manifest.json",
  ]);
  run("example:diff", process.execPath, [
    "mcpfn/cli/dist/bin.js", "diff", "mcpfn/examples/calculator.manifest.json", candidateManifest,
    "--fail-on-behavioral",
  ]);
  run("example:scenarios", process.execPath, [
    "mcpfn/cli/dist/bin.js", "test", "mcpfn/examples/calculator-server.ts",
    "mcpfn/examples/calculator-scenarios.ts", "--output", scenarioReport,
  ]);
  run("official:conformance", process.execPath, ["scripts/test-mcpfn-conformance.mjs"]);

  const packageNames = ["@mcpfn/core", "@mcpfn/auth", "@mcpfn/testing", "@mcpfn/datafn", "@mcpfn/cli"];
  run("packages:esm-import", process.execPath, [
    "--input-type=module",
    "-e",
    `for (const name of ${JSON.stringify(packageNames)}) { const loaded = await import(name); if (Object.keys(loaded).length === 0) throw new Error(name + " has no ESM exports"); }`,
  ]);
  run("packages:cjs-require", process.execPath, [
    "-e",
    `for (const name of ${JSON.stringify(packageNames)}) { const loaded = require(name); if (Object.keys(loaded).length === 0) throw new Error(name + " has no CJS exports"); }`,
  ]);
  const testingSubpaths = ["@mcpfn/testing/auth", "@mcpfn/testing/playwright"];
  run("testing-subpaths:esm-import", process.execPath, [
    "--input-type=module",
    "-e",
    `for (const name of ${JSON.stringify(testingSubpaths)}) { const loaded = await import(name); if (Object.keys(loaded).length === 0) throw new Error(name + " has no ESM exports"); }`,
  ]);
  run("testing-subpaths:cjs-require", process.execPath, [
    "-e",
    `for (const name of ${JSON.stringify(testingSubpaths)}) { const loaded = require(name); if (Object.keys(loaded).length === 0) throw new Error(name + " has no CJS exports"); }`,
  ]);

  for (const packagePath of ["mcpfn/core", "mcpfn/auth", "mcpfn/testing", "mcpfn/datafn", "mcpfn/cli"]) {
    verifyPackage(packagePath);
  }
  verifyDocumentation();

  console.log(JSON.stringify({
    ok: true,
    gate: "npm run gate:mcpfn-release",
    steps: results.map(({ stdout, stderr, ...result }) => result),
  }));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    steps: results.map(({ stdout, stderr, ...result }) => result),
  }));
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
