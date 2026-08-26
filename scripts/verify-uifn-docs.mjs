#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const frameworks = ['react', 'svelte', 'solid'];
const catalogFamilies = ['components', 'hooks', 'patterns', 'sf'];
const failures = [];

const docsFiles = [
  'uifn/README.md',
  'uifn/adapter-kit/README.md',
  'uifn/components/README.md',
  'uifn/core/README.md',
  'uifn/examples/README.md',
  'uifn/patterns/README.md',
  'uifn/react/README.md',
  'uifn/recipes/README.md',
  'uifn/registry/README.md',
  'uifn/sf/README.md',
  'uifn/solid/README.md',
  'uifn/storybook/README.md',
  'uifn/svelte/README.md',
  'uifn/theme-tailwind/README.md',
  'uifn/theme/README.md',
  'uifn/tokens/README.md',
  'uifn/registry/docs/hooks.md',
];

const targetPackages = [
  '@uifn/core',
  '@uifn/adapter-kit',
  '@uifn/react',
  '@uifn/svelte',
  '@uifn/solid',
  '@uifn/tokens',
  '@uifn/theme',
  '@uifn/recipes',
  '@uifn/theme-tailwind',
  '@uifn/components',
  '@uifn/patterns',
  '@uifn/sf',
  '@uifn/registry',
  '@uifn/storybook',
];

const requiredReadmeTokens = [
  {
    file: 'uifn/README.md',
    tokens: ['React, Svelte, and Solid', 'semantic design tokens', 'Tailwind', 'Storybook', 'semantic versioning'],
  },
  {
    file: 'uifn/components/README.md',
    tokens: ['framework-neutral', '@uifn/components-react', '@uifn/components-svelte', '@uifn/components-solid', 'source install', 'tokens', 'recipes'],
  },
  {
    file: 'uifn/registry/README.md',
    tokens: ['source install', '.uifn/registry.lock', 'uifn add', 'uifn diff', 'uifn update', 'SHA-256'],
  },
  {
    file: 'uifn/storybook/README.md',
    tokens: ['generated docs', 'compatibility panel', 'interaction', 'a11y', 'visual matrix'],
  },
  {
    file: 'uifn/tokens/README.md',
    tokens: ['color.surface.canvas', 'color.text.primary', 'radius.md', 'motion.easing.standard'],
  },
  {
    file: 'uifn/recipes/README.md',
    tokens: ['surface', 'buttonRecipe', 'CSS variables', 'stripe'],
  },
  {
    file: 'uifn/patterns/README.md',
    tokens: ['AuthPanel', 'ApiKeyTable', 'BillingPlanCards', 'status', 'fixtures'],
  },
  {
    file: 'uifn/sf/README.md',
    tokens: ['injected client', 'authfn', 'plugfn', 'filefn', 'billfn', 'fake tenants'],
  },
];

const localPathPattern = /\/(?:Users|tmp|private|home|workspace|var|opt|Volumes)\/[^\s"',)]+|[A-Za-z]:\\/;
const semverPattern = /^\d+\.\d+\.\d+$/;

function fail(code, details = {}) {
  failures.push({ code, ...details });
}

function file(pathname) {
  return path.join(repoRoot, pathname);
}

function read(pathname) {
  return readFileSync(file(pathname), 'utf8');
}

function readJson(pathname) {
  return JSON.parse(read(pathname));
}

function readCatalogFamily(family) {
  const dir = file(`uifn/registry/catalog/${family}`);
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .sort()
    .map((entry) => readJson(`uifn/registry/catalog/${family}/${entry}`));
}

function packageNameFromImport(packageImport) {
  const match = packageImport.match(/from\s+['"]([^'"]+)['"]/);
  return match?.[1];
}

function packageRoot(packageName) {
  if (!packageName.startsWith('@')) {
    return packageName.split('/')[0] ?? packageName;
  }

  const parts = packageName.split('/');
  return `${parts[0]}/${parts[1]}`;
}

function packageDir(packageName) {
  return packageRoot(packageName).replace('@uifn/', 'uifn/');
}

function exportSubpath(packageName) {
  const root = packageRoot(packageName);
  return packageName === root ? '.' : `.${packageName.slice(root.length)}`;
}

function packageExportsFor(packageName) {
  const packageJson = readJson(`${packageDir(packageName)}/package.json`);
  return Object.keys(packageJson.exports ?? {});
}

function sourceInstallPaths(sourceInstall) {
  return Object.values(sourceInstall ?? {}).filter((value) => typeof value === 'string' && value.length > 0);
}

function artifactRefs(manifest, field) {
  return (manifest[field] ?? []).map((ref) => ({ id: ref.id, file: ref.file }));
}

function buildGeneratedDocsPages(manifests) {
  return manifests.map((manifest) => ({
    title: manifest.name,
    slug: manifest.slug,
    version: manifest.version,
    kind: manifest.kind,
    status: manifest.status,
    frameworks: Object.entries(manifest.frameworks)
      .filter(([, metadata]) => metadata.supported)
      .map(([framework]) => framework),
    packageImports: Object.fromEntries(
      Object.entries(manifest.frameworks).map(([framework, metadata]) => [framework, metadata.packageImport])
    ),
    packageExports: Object.fromEntries(
      Object.entries(manifest.frameworks).map(([framework, metadata]) => {
        const packageName = packageNameFromImport(metadata.packageImport);
        return [framework, packageName?.startsWith('@uifn/') ? packageExportsFor(packageName).sort() : []];
      })
    ),
    sourceInstall: Object.fromEntries(
      Object.entries(manifest.frameworks).map(([framework, metadata]) => [framework, metadata.sourceInstall])
    ),
    stories: artifactRefs(manifest, 'stories'),
    fixtures: artifactRefs(manifest, 'fixtures'),
    tests: artifactRefs(manifest, 'tests'),
    tokenGroups: manifest.tokenGroups ?? [],
    recipeDependencies: manifest.recipeDependencies ?? [],
    backing: manifest.backing ?? [],
    controlledCounterpart: manifest.controlledCounterpart,
  }));
}

for (const docsFile of docsFiles) {
  if (!existsSync(file(docsFile))) {
    fail('UIFN_DOCS_FILE_MISSING', { path: docsFile });
    continue;
  }

  if (localPathPattern.test(read(docsFile))) {
    fail('UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', { path: docsFile });
  }
}

for (const { file: readmeFile, tokens } of requiredReadmeTokens) {
  if (!existsSync(file(readmeFile))) {
    continue;
  }

  const source = read(readmeFile);
  for (const token of tokens) {
    if (!source.includes(token)) {
      fail('UIFN_DOCS_REQUIRED_TOPIC_MISSING', { path: readmeFile, token });
    }
  }
}

const rootReadme = existsSync(file('uifn/README.md')) ? read('uifn/README.md') : '';
for (const packageName of targetPackages) {
  if (!rootReadme.includes(packageName)) {
    fail('UIFN_DOCS_PACKAGE_MATRIX_MISSING', { package: packageName });
  }
}

const manifests = catalogFamilies.flatMap(readCatalogFamily);
const pages = buildGeneratedDocsPages(manifests);

for (const page of pages) {
  if (!semverPattern.test(page.version ?? '')) {
    fail('UIFN_DOCS_VERSION_MISSING', { slug: page.slug });
  }

  for (const framework of frameworks) {
    if (!page.frameworks.includes(framework)) {
      fail('UIFN_DOCS_FRAMEWORK_MISSING', { slug: page.slug, framework });
    }

    const packageImport = page.packageImports[framework];
    if (!packageImport) {
      fail('UIFN_DOCS_PACKAGE_IMPORT_MISSING', { slug: page.slug, framework });
      continue;
    }

    const packageName = packageNameFromImport(packageImport);
    if (!packageName?.startsWith('@uifn/')) {
      fail('UIFN_DOCS_PACKAGE_IMPORT_INVALID', { slug: page.slug, framework, packageImport });
      continue;
    }

    const exports = page.packageExports[framework] ?? [];
    const subpath = exportSubpath(packageName);
    if (!exports.includes(subpath)) {
      fail('UIFN_DOCS_PACKAGE_EXPORT_MISSING', { slug: page.slug, framework, packageName, subpath });
    }

    const installPaths = sourceInstallPaths(page.sourceInstall[framework]);
    if (installPaths.length === 0) {
      fail('UIFN_DOCS_SOURCE_INSTALL_MISSING', { slug: page.slug, framework });
    }
    for (const installPath of installPaths) {
      if (localPathPattern.test(installPath)) {
        fail('UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', { slug: page.slug, framework, path: installPath });
      }
    }
  }

  for (const field of ['stories', 'fixtures', 'tests']) {
    if (!Array.isArray(page[field]) || page[field].length === 0) {
      fail('UIFN_DOCS_ARTIFACT_REFS_MISSING', { slug: page.slug, field });
      continue;
    }

    for (const ref of page[field]) {
      if (!ref.file || !existsSync(file(ref.file))) {
        fail('UIFN_DOCS_ARTIFACT_REF_FILE_MISSING', { slug: page.slug, field, id: ref.id, path: ref.file });
      }
    }
  }

  if (page.kind === 'component') {
    if (page.tokenGroups.length === 0) {
      fail('UIFN_DOCS_TOKEN_GROUPS_MISSING', { slug: page.slug });
    }
    if (page.recipeDependencies.length === 0) {
      fail('UIFN_DOCS_RECIPE_DEPENDENCIES_MISSING', { slug: page.slug });
    }
  }

  if (page.kind === 'sf-pattern') {
    if (page.backing.length === 0) {
      fail('UIFN_DOCS_BACKING_MISSING', { slug: page.slug });
    }
    if (!page.controlledCounterpart) {
      fail('UIFN_DOCS_CONTROLLED_COUNTERPART_MISSING', { slug: page.slug });
    }
  }
}

const serializedDocs = JSON.stringify(pages);
if (localPathPattern.test(serializedDocs)) {
  fail('UIFN_DOCS_ABSOLUTE_PATH_FORBIDDEN', { path: 'generated-docs' });
}

const hookDocs = existsSync(file('uifn/registry/docs/hooks.md')) ? read('uifn/registry/docs/hooks.md') : '';
for (const hook of ['useMediaQuery', 'useCopyToClipboard']) {
  if (!hookDocs.includes(hook)) {
    fail('UIFN_DOCS_HOOK_MISSING', { hook });
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ ok: false, command: 'verify:uifn-docs', failureCount: failures.length, failures }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      command: 'verify:uifn-docs',
      docsFiles: docsFiles.length,
      pageCount: pages.length,
      componentCount: pages.filter((page) => page.kind === 'component').length,
      hookCount: pages.filter((page) => page.kind === 'hook').length,
      patternCount: pages.filter((page) => page.kind === 'pattern').length,
      sfPatternCount: pages.filter((page) => page.kind === 'sf-pattern').length,
      frameworks,
      checks: ['readmes', 'package-matrix', 'package-imports', 'package-exports', 'source-install', 'story-fixture-test-refs', 'tokens', 'recipes', 'local-path-hygiene'],
    },
    null,
    2
  )
);
