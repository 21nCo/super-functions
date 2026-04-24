import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { discoverSuperfunctionsPackages } from './discover-packages.js';

export interface DiscoveredConfig {
  libraryName: string;     // 'conduct', 'authfn', etc
  configPath: string;       // absolute path to config file
  packageName: string;      // '@superfunctions/conduct' or 'conduct'
}

/**
 * Discover library config files
 * Pattern: <library-name>.config.{ts,js,mjs}
 */
export async function discoverLibraryConfigs(
  cwd: string,
  manualPaths?: string[]
): Promise<DiscoveredConfig[]> {
  const discovered: DiscoveredConfig[] = [];

  // 1. Auto-discovery using glob pattern
  const patterns = [
    '*.config.{ts,js,mjs}',
    'src/**/*.config.{ts,js,mjs}',
    'lib/**/*.config.{ts,js,mjs}',
    'server/**/*.config.{ts,js,mjs}',
  ];

  const files = await glob(patterns, {
    cwd,
    ignore: ['node_modules/**', 'dist/**', 'build/**'],
    absolute: true,
  });

  const installedLibrariesByName = buildInstalledLibraryMap(cwd);

  for (const file of files) {
    const basename = path.basename(file);
    const match = basename.match(/^([^.]+)\.config\.(ts|js|mjs)$/);

    if (match) {
      const libraryName = match[1]; // 'conduct', 'authfn', etc

      const packageName = installedLibrariesByName.get(libraryName);
      if (packageName) {
        discovered.push({
          libraryName,
          configPath: file,
          packageName,
        });
      }
    }
  }

  // 2. Manual paths from config (fallback)
  if (manualPaths) {
    for (const manualPath of manualPaths) {
      const resolved = path.resolve(cwd, manualPath);
      if (fs.existsSync(resolved)) {
        const extracted = await extractLibraryReference(resolved, installedLibrariesByName);
        if (extracted) {
          const packageName =
            extracted.packageName ?? installedLibrariesByName.get(extracted.libraryName);
          if (!packageName) {
            continue;
          }
          discovered.push({
            libraryName: extracted.libraryName,
            configPath: resolved,
            packageName,
          });
        }
      }
    }
  }

  return discovered;
}

/**
 * Helper to extract library name from config file
 */
function buildInstalledLibraryMap(cwd: string): Map<string, string> {
  const installed = discoverSuperfunctionsPackages(cwd);
  const mapped = new Map<string, string>();

  for (const pkg of installed) {
    for (const libraryName of pkg.libraryNames) {
      mapped.set(libraryName, pkg.packageName);
    }
  }

  return mapped;
}

async function extractLibraryReference(
  configPath: string,
  installedLibrariesByName: Map<string, string>
): Promise<{ libraryName: string; packageName?: string } | null> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const specifiers = new Set<string>();
    for (const match of content.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      specifiers.add(match[1]);
    }
    for (const match of content.matchAll(/import\s+['"]([^'"]+)['"]/g)) {
      specifiers.add(match[1]);
    }
    for (const match of content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      specifiers.add(match[1]);
    }

    for (const specifier of specifiers) {
      const candidate = normalizeLibrarySpecifier(specifier);
      if (!candidate) {
        continue;
      }

      const packageName = installedLibrariesByName.get(candidate.libraryName);
      if (packageName) {
        return {
          libraryName: candidate.libraryName,
          packageName,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

function normalizeLibrarySpecifier(
  specifier: string
): { libraryName: string; packageName?: string } | null {
  if (specifier.startsWith('@superfunctions/')) {
    const [, name] = specifier.split('/');
    if (!name) {
      return null;
    }
    return {
      libraryName: name,
      packageName: `@superfunctions/${name}`,
    };
  }

  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    if (scope && name) {
      return {
        libraryName: name === 'core' ? scope.slice(1) : name,
        packageName: `${scope}/${name}`,
      };
    }
    return null;
  }

  if (/^[a-z0-9-]+(?:\/.*)?$/i.test(specifier)) {
    const libraryName = specifier.split('/')[0];
    return {
      libraryName,
      packageName: libraryName,
    };
  }

  return null;
}
