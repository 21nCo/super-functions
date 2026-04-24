/**
 * Discover superfunctions libraries in node_modules
 *
 * Scans installed packages for those with superfunctions metadata
 * in their package.json, building a dynamic registry of initialization
 * functions.
 */

import fs from "node:fs";
import path from "node:path";

export interface SuperfunctionsPackageMetadata {
  packageName: string;
  initFunction: string;
  schemaVersion?: number;
  libraryNames: string[];
}

export interface PackageRegistry {
  [initFunction: string]:
    | string
    | {
        packageName: string;
        libraryName: string;
      };
}

/**
 * Discover all superfunctions libraries in node_modules
 */
export function discoverSuperfunctionsPackages(
  cwd: string = process.cwd()
): SuperfunctionsPackageMetadata[] {
  const discovered: SuperfunctionsPackageMetadata[] = [];
  const nodeModulesPaths = findNodeModulesPaths(cwd);
  const seenPackageNames = new Set<string>();

  if (nodeModulesPaths.length === 0) {
    return discovered;
  }

  for (const nodeModulesPath of nodeModulesPaths) {
    scanDirectory(nodeModulesPath, discovered, seenPackageNames);
  }

  return discovered;
}

export function findNodeModulesPaths(startDir: string): string[] {
  const paths: string[] = [];
  let currentDir = path.resolve(startDir);

  while (true) {
    const nodeModulesPath = path.join(currentDir, "node_modules");
    if (fs.existsSync(nodeModulesPath)) {
      paths.push(nodeModulesPath);
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return paths;
    }

    currentDir = parentDir;
  }
}

export function findNearestNodeModulesPath(startDir: string): string | null {
  return findNodeModulesPaths(startDir)[0] ?? null;
}

/**
 * Build a registry map from discovered packages
 */
export function buildRegistry(
  packages: SuperfunctionsPackageMetadata[]
): PackageRegistry {
  const registry: PackageRegistry = {};

  for (const pkg of packages) {
    registry[pkg.initFunction] = {
      packageName: pkg.packageName,
      libraryName: pkg.libraryNames[0] ?? deriveLibraryNames(pkg.packageName)[0] ?? pkg.packageName
    };
  }

  return registry;
}

function scanDirectory(
  dir: string,
  discovered: SuperfunctionsPackageMetadata[],
  seenPackageNames: Set<string> = new Set()
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    // Check for directory or symlink to directory
    let isDir = entry.isDirectory();
    if (entry.isSymbolicLink()) {
      try {
        const stats = fs.statSync(entryPath);
        isDir = stats.isDirectory();
      } catch (e) {
        // Ignore broken symlinks
        isDir = false;
      }
    }

    if (!isDir) continue;

    // Handle scoped packages (@superfunctions/authfn, etc.)
    if (entry.name.startsWith("@")) {
      scanDirectory(entryPath, discovered, seenPackageNames);
      continue;
    }

    // Check for package.json
    const packageJsonPath = path.join(entryPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );

        // Check for superfunctions metadata
        if (
          packageJson.superfunctions &&
          packageJson.superfunctions.initFunction
        ) {
          const packageName = String(packageJson.name ?? entry.name);
          if (seenPackageNames.has(packageName)) {
            continue;
          }
          seenPackageNames.add(packageName);

          discovered.push({
            packageName,
            initFunction: packageJson.superfunctions.initFunction,
            schemaVersion: packageJson.superfunctions.schemaVersion,
            libraryNames: deriveLibraryNames(
              packageName,
              packageJson.superfunctions.libraryNames,
              packageJson.superfunctions.namespace,
            ),
          });
        }
      } catch (e) {
        // Skip malformed package.json files
        continue;
      }
    }
  }
}

/**
 * Get registry for use in parser
 * This is the main export that replaces the hardcoded LIBRARY_REGISTRY
 */
export function getSuperfunctionsRegistry(
  cwd: string = process.cwd()
): PackageRegistry {
  const packages = discoverSuperfunctionsPackages(cwd);
  return buildRegistry(packages);
}

function deriveLibraryNames(
  packageName: string,
  explicitLibraryNames?: unknown,
  explicitNamespace?: unknown,
): string[] {
  if (Array.isArray(explicitLibraryNames)) {
    const normalized = explicitLibraryNames
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    if (normalized.length > 0) {
      return [...new Set(normalized)];
    }
  }

  if (typeof explicitNamespace === "string" && explicitNamespace.trim().length > 0) {
    return [explicitNamespace.trim()];
  }

  if (packageName.startsWith("@superfunctions/")) {
    return [packageName.slice("@superfunctions/".length)];
  }

  if (packageName.startsWith("@")) {
    const [scope, name] = packageName.split("/");
    if (scope && name) {
      const scopeName = scope.slice(1);
      if (name === "core") {
        return [scopeName];
      }

      return [name];
    }
  }

  return [packageName];
}
