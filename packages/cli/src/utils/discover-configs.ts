import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { detectInstalledLibraries } from './libraries.js';

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

  // Check installed libraries once before the loop (performance optimization)
  const installedLibs = detectInstalledLibraries(cwd);

  for (const file of files) {
    const basename = path.basename(file);
    const match = basename.match(/^([^.]+)\.config\.(ts|js|mjs)$/);

    if (match) {
      const libraryName = match[1]; // 'conduct', 'authfn', etc

      // Check if library is installed
      const isInstalled = installedLibs.some(
        lib => lib.name.includes(libraryName)
      );

      if (isInstalled) {
        discovered.push({
          libraryName,
          configPath: file,
          packageName: `@superfunctions/${libraryName}`,
        });
      }
    }
  }

  // 2. Manual paths from config (fallback)
  if (manualPaths) {
    for (const manualPath of manualPaths) {
      const resolved = path.resolve(cwd, manualPath);
      if (fs.existsSync(resolved)) {
        // Extract library name from path or file content
        const libraryName = await extractLibraryName(resolved);
        if (libraryName) {
          discovered.push({
            libraryName,
            configPath: resolved,
            packageName: `@superfunctions/${libraryName}`,
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
async function extractLibraryName(configPath: string): Promise<string | null> {
  try {
    // Try reading first few lines to find library import
    const content = fs.readFileSync(configPath, 'utf-8');
    const importMatch = content.match(
      /import.*from ['"](@superfunctions\/)?(\w+)['"]/
    );

    if (importMatch) {
      return importMatch[2]; // authfn, conduct, etc
    }

    return null;
  } catch {
    return null;
  }
}
