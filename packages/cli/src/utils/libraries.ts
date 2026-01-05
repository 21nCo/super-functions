import fs from 'node:fs';
import path from 'node:path';

export interface DetectedLibrary {
  name: string;
  packagePath: string;
  version?: string;
}

export function detectInstalledLibraries(rootDir: string = process.cwd()): DetectedLibrary[] {
  const nodeModules = path.join(rootDir, 'node_modules', '@superfunctions');
  if (!fs.existsSync(nodeModules)) return [];
  const names = fs.readdirSync(nodeModules).filter((n) => !['db', 'cli'].includes(n));
  const results: DetectedLibrary[] = [];
  for (const n of names) {
    const pkgDir = path.join(nodeModules, n);
    const pkgJson = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf-8'));
        results.push({ 
          name: `@superfunctions/${n}`, 
          packagePath: pkgDir,
          version: pkg.version 
        });
      } catch {
        results.push({ name: `@superfunctions/${n}`, packagePath: pkgDir });
      }
    }
  }
  return results;
}
