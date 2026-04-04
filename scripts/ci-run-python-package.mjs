#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { discoverPythonPackages, topologicalLocalDependencies } from "./ci-utils.mjs";

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const packageDir = args.find((value) => value !== "--dry-run");

if (!packageDir) {
  console.error("usage: node scripts/ci-run-python-package.mjs [--dry-run] <package-dir>");
  process.exit(1);
}

const normalizedTargetDir = packageDir.replace(/\/+$/, "");
const pythonPackages = discoverPythonPackages(repoRoot).map((manifest) => ({
  ...manifest,
  name: manifest.name.toLowerCase(),
}));
const manifestsByDir = new Map(pythonPackages.map((manifest) => [manifest.dir, manifest]));
const manifestsByName = new Map(pythonPackages.map((manifest) => [manifest.name, manifest]));

if (!manifestsByDir.has(normalizedTargetDir)) {
  console.error(`unknown python package: ${normalizedTargetDir}`);
  process.exit(1);
}

const targetManifest = manifestsByDir.get(normalizedTargetDir);
const installOrder = topologicalLocalDependencies(targetManifest.name, manifestsByName);
const dependencyInstalls = installOrder.filter((manifest) => manifest.dir !== targetManifest.dir);

const targetCwd = path.join(repoRoot, targetManifest.dir);
const hasTestsDir = existsSync(path.join(targetCwd, "tests"));

function run(command, commandArgs, options = {}) {
  const rendered = [command, ...commandArgs].join(" ");
  console.log(`$ ${rendered}`);

  if (dryRun) {
    return;
  }

  execFileSync(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    stdio: "inherit",
  });
}

if (dependencyInstalls.length > 0) {
  run(
    "python",
    ["-m", "pip", "install", ...dependencyInstalls.flatMap((manifest) => ["-e", manifest.dir])]
  );
}

const targetSpecifier = targetManifest.hasDevDependencyGroup
  ? `${targetManifest.dir}[dev]`
  : targetManifest.dir;

run("python", ["-m", "pip", "install", "-e", targetSpecifier]);

if (!targetManifest.hasDevDependencyGroup) {
  run("python", [
    "-m",
    "pip",
    "install",
    "build",
    "pytest",
    "pytest-asyncio",
    "pytest-cov",
    "mypy",
    "ruff",
  ]);
}

run("python", ["-m", "build", "--wheel", "--sdist", "."], { cwd: targetCwd });

if (targetManifest.hasRuff) {
  run("python", ["-m", "ruff", "check", "."], { cwd: targetCwd });
}

if (targetManifest.hasMypy) {
  run("python", ["-m", "mypy", "."], { cwd: targetCwd });
}

if (targetManifest.hasPytest || hasTestsDir) {
  run("python", ["-m", "pytest", "."], { cwd: targetCwd });
}

console.log(
  JSON.stringify(
    {
      package: targetManifest.name,
      path: targetManifest.dir,
      dependencies: dependencyInstalls.map((manifest) => manifest.dir),
      dryRun,
    },
    null,
    2
  )
);
