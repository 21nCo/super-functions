/**
 * Auto-discover library initialization files in codebase
 * 
 * Scans the codebase using glob patterns to find files containing
 * library initialization calls, without requiring explicit file paths.
 */

import { glob } from 'glob';
import path from 'node:path';
import { parseLibraryInitializations } from './parse-library-init.js';
import type { PackageRegistry } from './discover-packages.js';

export interface AutoDiscoverOptions {
  patterns?: string[];
  exclude?: string[];
}

/**
 * Default patterns to scan for library initializations
 */
export const DEFAULT_PATTERNS = [
  'src/**/*.{ts,tsx,js,jsx,mjs}',
  'lib/**/*.{ts,tsx,js,jsx,mjs}',
  'server/**/*.{ts,tsx,js,jsx,mjs}',
  'app/**/*.{ts,tsx,js,jsx,mjs}',
];

/**
 * Default exclusion patterns
 */
export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/__tests__/**',
  '**/__mocks__/**',
];

/**
 * Auto-discover files containing library initializations
 */
export async function autoDiscoverLibraryFiles(
  cwd: string,
  registry: PackageRegistry,
  options?: AutoDiscoverOptions | boolean
): Promise<string[]> {
  // Determine patterns and exclusions
  const patterns = typeof options === 'object' && options.patterns
    ? options.patterns
    : DEFAULT_PATTERNS;
    
  const exclude = typeof options === 'object' && options.exclude
    ? options.exclude
    : DEFAULT_EXCLUDE;

  // Find all matching files
  const files = await glob(patterns, {
    cwd,
    ignore: exclude,
    absolute: true,
    nodir: true,
  });

  // Parse each file and keep only those with library initializations
  const filesWithInits: string[] = [];
  
  for (const file of files) {
    try {
      const inits = parseLibraryInitializations(file, registry);
      if (inits.length > 0) {
        filesWithInits.push(file);
      }
    } catch (e) {
      // Skip files that can't be parsed (syntax errors, etc.)
      continue;
    }
  }

  return filesWithInits;
}

/**
 * Get relative paths for display
 */
export function toRelativePaths(files: string[], cwd: string): string[] {
  return files.map(file => {
    const rel = path.relative(cwd, file);
    return rel.startsWith('.') ? rel : `./${rel}`;
  });
}
