#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export function walkFiles(rootDir, targetFileName, results = [], currentDir = rootDir) {
  const entries = readdirSync(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      walkFiles(rootDir, targetFileName, results, path.join(currentDir, entry.name));
      continue;
    }

    if (entry.isFile() && entry.name === targetFileName) {
      results.push(path.relative(rootDir, path.join(currentDir, entry.name)));
    }
  }

  return results;
}

export function discoverJsPackages(rootDir) {
  return walkFiles(rootDir, "package.json")
    .filter((relativePath) => relativePath !== "package.json")
    .map((relativePath) => {
      const manifest = JSON.parse(readFileSync(path.join(rootDir, relativePath), "utf8"));
      return {
        dir: path.dirname(relativePath),
        file: relativePath,
        name: manifest.name || path.dirname(relativePath),
        private: Boolean(manifest.private),
        scripts: manifest.scripts || {},
      };
    });
}

function extractQuotedStrings(source) {
  const values = [];
  const matcher = /"([^"]+)"/g;
  let match;

  while ((match = matcher.exec(source)) !== null) {
    values.push(match[1]);
  }

  return values;
}

function readTomlArray(lines, startIndex) {
  let cursor = startIndex;
  let combined = lines[cursor];

  while (!combined.includes("]") && cursor + 1 < lines.length) {
    cursor += 1;
    combined += `\n${lines[cursor]}`;
  }

  return {
    items: extractQuotedStrings(combined),
    nextIndex: cursor + 1,
  };
}

function normalizeDependencyName(specifier) {
  const cleaned = specifier.replace(/\s+#.*$/, "").trim();
  const boundary = cleaned.search(/[<>=!~;\[]/);
  const packageName = boundary === -1 ? cleaned : cleaned.slice(0, boundary);
  return packageName.trim().toLowerCase();
}

export function parsePyprojectManifest(rootDir, relativePath) {
  const source = readFileSync(path.join(rootDir, relativePath), "utf8");
  const lines = source.split(/\r?\n/);

  let cursor = 0;
  let section = "";
  let name = null;
  let dependencies = [];
  let hasDevDependencyGroup = false;
  let hasRuff = false;
  let hasMypy = false;
  let hasPytest = false;

  while (cursor < lines.length) {
    const trimmed = lines[cursor].trim();

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = trimmed.slice(1, -1);
      hasRuff ||= section === "tool.ruff" || section === "tool.ruff.lint";
      hasMypy ||= section === "tool.mypy";
      hasPytest ||= section === "tool.pytest.ini_options";
      cursor += 1;
      continue;
    }

    if (section === "project" && trimmed.startsWith("name =")) {
      const match = trimmed.match(/name\s*=\s*"([^"]+)"/);
      if (match) {
        name = match[1];
      }
      cursor += 1;
      continue;
    }

    if (section === "project" && trimmed.startsWith("dependencies = [")) {
      const parsed = readTomlArray(lines, cursor);
      dependencies = parsed.items.map(normalizeDependencyName).filter(Boolean);
      cursor = parsed.nextIndex;
      continue;
    }

    if (section === "project.optional-dependencies" && trimmed.startsWith("dev = [")) {
      hasDevDependencyGroup = true;
      const parsed = readTomlArray(lines, cursor);
      if (parsed.items.length > 0) {
        hasPytest ||= parsed.items.some((item) => item.startsWith("pytest"));
        hasMypy ||= parsed.items.some((item) => item.startsWith("mypy"));
        hasRuff ||= parsed.items.some((item) => item.startsWith("ruff"));
      }
      cursor = parsed.nextIndex;
      continue;
    }

    cursor += 1;
  }

  return {
    dir: path.dirname(relativePath),
    file: relativePath,
    name: name || path.dirname(relativePath),
    dependencies,
    hasDevDependencyGroup,
    hasMypy,
    hasPytest,
    hasRuff,
  };
}

export function discoverPythonPackages(rootDir) {
  return walkFiles(rootDir, "pyproject.toml").map((relativePath) =>
    parsePyprojectManifest(rootDir, relativePath)
  );
}

export function findNearestManifestDir(filePath, manifestDirs) {
  let current = filePath;

  while (current && current !== ".") {
    if (manifestDirs.has(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }

    current = parent;
  }

  return null;
}

export function topologicalLocalDependencies(packageName, manifestsByName) {
  const ordered = [];
  const visited = new Set();

  function visit(name) {
    if (visited.has(name)) {
      return;
    }

    visited.add(name);
    const manifest = manifestsByName.get(name);
    if (!manifest) {
      return;
    }

    for (const dependency of manifest.dependencies) {
      if (!manifestsByName.has(dependency)) {
        continue;
      }

      visit(dependency);
    }

    ordered.push(manifest);
  }

  visit(packageName);
  return ordered;
}

export function manifestExists(rootDir, relativePath) {
  return existsSync(path.join(rootDir, relativePath));
}
