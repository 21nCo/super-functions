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
}

export interface PackageRegistry {
  [initFunction: string]: string; // initFunction -> packageName
}

/**
 * Discover all superfunctions libraries in node_modules
 */
export function discoverSuperfunctionsPackages(
  cwd: string = process.cwd()
): SuperfunctionsPackageMetadata[] {
  const discovered: SuperfunctionsPackageMetadata[] = [];
  const nodeModulesPath = path.join(cwd, "node_modules");

  if (!fs.existsSync(nodeModulesPath)) {
    return discovered;
  }

  // Scan node_modules
  scanDirectory(nodeModulesPath, discovered);

  return discovered;
}

/**
 * Build a registry map from discovered packages
 */
export function buildRegistry(
  packages: SuperfunctionsPackageMetadata[]
): PackageRegistry {
  const registry: PackageRegistry = {};

  for (const pkg of packages) {
    registry[pkg.initFunction] = pkg.packageName;
  }

  return registry;
}

function scanDirectory(
  dir: string,
  discovered: SuperfunctionsPackageMetadata[]
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
      scanDirectory(entryPath, discovered);
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
          discovered.push({
            packageName: packageJson.name,
            initFunction: packageJson.superfunctions.initFunction,
            schemaVersion: packageJson.superfunctions.schemaVersion,
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
