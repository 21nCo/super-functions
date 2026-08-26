import { existsSync } from 'node:fs';
import path from 'node:path';

export function findRepoRoot(startDir = process.cwd()): string {
  let current = path.resolve(startDir);

  for (;;) {
    if (existsSync(path.join(current, 'uifn', 'registry', 'catalog'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(startDir);
    }

    current = parent;
  }
}
