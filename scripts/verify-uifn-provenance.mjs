#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const failures = [];
const readableExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.mts', '.svelte', '.ts', '.tsx', '.yml', '.yaml']);
const roots = [
  'uifn/README.md',
  'uifn/adapter-kit',
  'uifn/components',
  'uifn/core',
  'uifn/examples',
  'uifn/patterns',
  'uifn/react',
  'uifn/recipes',
  'uifn/registry',
  'uifn/sf',
  'uifn/solid',
  'uifn/storybook',
  'uifn/svelte',
  'uifn/theme',
  'uifn/theme-tailwind',
  'uifn/tokens',
];
const packageJsonFiles = [
  'uifn/adapter-kit/package.json',
  'uifn/components/package.json',
  'uifn/core/package.json',
  'uifn/patterns/package.json',
  'uifn/react/package.json',
  'uifn/recipes/package.json',
  'uifn/registry/package.json',
  'uifn/sf/package.json',
  'uifn/solid/package.json',
  'uifn/storybook/package.json',
  'uifn/svelte/package.json',
  'uifn/theme/package.json',
  'uifn/theme-tailwind/package.json',
  'uifn/tokens/package.json',
];
const catalogFamilies = ['components', 'hooks', 'patterns', 'sf'];
const forbiddenLinePatterns = [
  {
    code: 'UIFN_PROVENANCE_EXTERNAL_DOMAIN',
    pattern: /(?:https?:\/\/)?(?:www\.)?(?:coss\.com|base-ui\.com|radix-ui\.com|ui\.shadcn\.com)\b/i,
  },
  {
    code: 'UIFN_PROVENANCE_EXTERNAL_PACKAGE',
    pattern: /@radix-ui\/|@base-ui|shadcn\/ui|coss-ui|class-variance-authority|tailwind-variants/i,
  },
  {
    code: 'UIFN_PROVENANCE_COPIED_PROSE_MARKER',
    pattern: /copy and paste|copy\/paste|beautifully designed components|accessible components that you can copy|unstyled accessible components/i,
  },
  {
    code: 'UIFN_PROVENANCE_PRIVATE_PRODUCT_MARKER',
    pattern: /\bnucleus\b|@uifn\/nucleus|nucleus-theme/i,
  },
  {
    code: 'UIFN_PROVENANCE_LEGACY_SCAFFOLD_MARKER',
    pattern: /legacy-unimplemented|uifnRegistryEntry|uifn-generated|TooltipProvider/,
  },
];

function file(pathname) {
  return path.join(repoRoot, pathname);
}

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function walk(pathname) {
  const absolute = file(pathname);
  if (!existsSync(absolute)) {
    return [];
  }

  const stat = statSync(absolute);
  if (stat.isFile()) {
    return readableExtensions.has(path.extname(pathname)) ? [pathname] : [];
  }

  return readdirSync(absolute)
    .filter((entry) => !['node_modules', 'dist', '.vite-vitest', '.svelte-kit'].includes(entry))
    .flatMap((entry) => walk(path.join(pathname, entry)));
}

function isAllowedReference(pathname, line) {
  if (pathname === 'uifn/README.md' && line.includes('Coss UI is a capability reference only')) {
    return true;
  }

  if (pathname.startsWith('uifn/registry/catalog/') && line.includes('"source": "https://coss.com/ui/docs"')) {
    return true;
  }

  if (
    pathname === 'uifn/registry/src/__tests__/registry-cli.test.ts' &&
    (line.includes("not.toContain('uifnRegistryEntry')") || line.includes("not.toContain('uifn-generated')"))
  ) {
    return true;
  }

  if (
    /uifn\/(?:react\/src|solid\/src|svelte\/lib)\/generated\/tooltip(?:\.tsx|\/index\.ts)$/.test(pathname) &&
    line.includes('TooltipProvider')
  ) {
    return true;
  }

  if (
    pathname.startsWith('uifn/storybook/workbenches/') &&
    line.includes('project-1-name') &&
    line.includes('Nucleus')
  ) {
    return true;
  }

  return false;
}

function readJson(pathname) {
  return JSON.parse(readFileSync(file(pathname), 'utf8'));
}

const scannedFiles = new Set();
for (const root of roots) {
  for (const pathname of walk(root)) {
    scannedFiles.add(pathname);
  }
}

for (const pathname of [...scannedFiles].sort()) {
  const lines = readFileSync(file(pathname), 'utf8').split('\n');
  lines.forEach((line, index) => {
    if (isAllowedReference(pathname, line)) {
      return;
    }

    for (const { code, pattern } of forbiddenLinePatterns) {
      if (pattern.test(line)) {
        fail(code, { path: pathname, line: index + 1 });
      }
    }
  });
}

for (const packageJsonFile of packageJsonFiles) {
  const packageJson = readJson(packageJsonFile);
  if (packageJson.uifn?.sourcePolicy !== 'clean-room') {
    fail('UIFN_PROVENANCE_PACKAGE_SOURCE_POLICY_MISSING', {
      path: packageJsonFile,
      package: packageJson.name,
    });
  }

  const dependencyNames = Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
  });
  for (const dependencyName of dependencyNames) {
    if (/@radix-ui\/|@base-ui|shadcn|coss|class-variance-authority|tailwind-variants/i.test(dependencyName)) {
      fail('UIFN_PROVENANCE_EXTERNAL_DEPENDENCY_FORBIDDEN', {
        path: packageJsonFile,
        package: packageJson.name,
        dependency: dependencyName,
      });
    }
  }
}

for (const family of catalogFamilies) {
  const dir = file(`uifn/registry/catalog/${family}`);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir).filter((candidate) => candidate.endsWith('.json'))) {
    const pathname = `uifn/registry/catalog/${family}/${entry}`;
    const manifest = readJson(pathname);
    if (manifest.sourcePolicy !== 'clean-room') {
      fail('UIFN_PROVENANCE_MANIFEST_SOURCE_POLICY_INVALID', { path: pathname, slug: manifest.slug });
    }
    if (manifest.registry?.provenance?.sourcePolicy !== 'clean-room') {
      fail('UIFN_PROVENANCE_REGISTRY_SOURCE_POLICY_INVALID', { path: pathname, slug: manifest.slug });
    }
    if (
      (manifest.kind === 'component' || manifest.kind === 'hook') &&
      (
        manifest.capabilityReference?.source !== 'https://coss.com/ui/docs' ||
        manifest.capabilityReference?.policy !== 'public-name-capability-reference-only'
      )
    ) {
      fail('UIFN_PROVENANCE_CAPABILITY_REFERENCE_INVALID', { path: pathname, slug: manifest.slug });
    }
    for (const field of ['stories', 'fixtures', 'tests']) {
      for (const ref of manifest[field] ?? []) {
        if (ref.provenance?.sourcePolicy !== 'clean-room') {
          fail('UIFN_PROVENANCE_REF_SOURCE_POLICY_INVALID', { path: pathname, slug: manifest.slug, field, id: ref.id });
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-provenance', failureCount: failures.length, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-provenance',
      scannedFiles: scannedFiles.size,
      packageMetadataFiles: packageJsonFiles.length,
      catalogFamilies,
      checks: ['clean-room-package-metadata', 'registry-provenance', 'external-domain-markers', 'external-package-markers', 'copied-prose-markers', 'private-product-markers', 'legacy-scaffold-markers'],
      allowedReferences: [
        'uifn/README.md:Coss capability reference statement',
        'registry catalog capabilityReference.source with public-name-capability-reference-only policy',
        'registry tests rejecting removed scaffold markers',
        'generated TooltipProvider public API declarations',
        'storybook workbench project-name fixture',
      ],
    },
    null,
    2
  )
);
