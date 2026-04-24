import { cpSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const docsDir = join(scriptsDir, '..');
const billfnDir = join(docsDir, '..');
const repoRoot = join(billfnDir, '..');
const billfnNodeModules = join(billfnDir, 'node_modules');

const defaultCandidateBases = [
  repoRoot,
  join(repoRoot, 'datafn', 'docs'),
  join(repoRoot, 'searchfn', 'docs'),
  join(repoRoot, 'hostfn', 'docs'),
  join(repoRoot, 'datafn'),
  join(repoRoot, 'searchfn'),
  join(repoRoot, 'hostfn'),
];

const candidateBasesByModule = {
  zod: [
    join(repoRoot, 'datafn', 'docs'),
    join(repoRoot, 'searchfn', 'docs'),
    join(repoRoot, 'hostfn', 'docs'),
    repoRoot,
  ],
};

const moduleNames = ['fumadocs-mdx', 'styled-jsx', 'zod'];
const entryCandidates = {
  'fumadocs-mdx': ['fumadocs-mdx/next', 'fumadocs-mdx'],
  'styled-jsx': ['styled-jsx', 'styled-jsx/index.js'],
  zod: ['zod'],
};

const require = createRequire(import.meta.url);

function findPackageRoot(resolvedPath, moduleName) {
  let current = dirname(resolvedPath);

  while (current !== dirname(current)) {
    const manifest = join(current, 'package.json');
    if (!existsSync(manifest)) {
      current = dirname(current);
      continue;
    }

    try {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
      if (parsed?.name === moduleName) {
        return current;
      }
    } catch {}

    current = dirname(current);
  }

  return null;
}

function resolveModuleDir(moduleName) {
  const entries = entryCandidates[moduleName] ?? [moduleName];
  const candidateBases = candidateBasesByModule[moduleName] ?? defaultCandidateBases;

  for (const base of candidateBases) {
    for (const entry of entries) {
      try {
        const resolved = require.resolve(entry, { paths: [base] });
        const packageRoot = findPackageRoot(resolved, moduleName);
        if (packageRoot) {
          return packageRoot;
        }
      } catch {}
    }
  }

  return null;
}

for (const moduleName of moduleNames) {
  const target = join(billfnNodeModules, moduleName);
  const needsNestedDeps = moduleName === 'fumadocs-mdx' && !existsSync(join(target, 'node_modules'));
  if (existsSync(target) && !needsNestedDeps) {
    continue;
  }

  const source = resolveModuleDir(moduleName);
  if (!source || !existsSync(source) || source === target) {
    continue;
  }

  cpSync(source, target, { recursive: true });
}
