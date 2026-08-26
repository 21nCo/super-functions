#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const staticOnly = process.argv.includes('--static-only');
const allowPendingReview = process.argv.includes('--allow-pending-review');
const failures = [];
const checks = [];

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function json(relative) {
  return JSON.parse(read(relative));
}

function walk(relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const child = path.join(relative, name);
    return statSync(path.join(root, child)).isDirectory() ? walk(child) : [child];
  });
}

function requireText(relative, values, code) {
  const source = read(relative);
  for (const value of values) {
    if (!source.includes(value)) failures.push({ code, path: relative, missing: value });
  }
}

function command(program, args) {
  const result = spawnSync(program, args, {
    cwd: root,
    env: { ...process.env, PATH: '/opt/homebrew/bin:/usr/bin:/bin' },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const entry = {
    command: [program, ...args].join(' '),
    passed: result.status === 0,
    status: result.status,
    stdoutTail: String(result.stdout ?? '').split('\n').slice(-12).join('\n'),
    stderrTail: String(result.stderr ?? '').split('\n').slice(-12).join('\n'),
  };
  checks.push(entry);
  if (!entry.passed) failures.push({ code: 'UIFN_STYLED_COMPARABILITY_COMMAND_FAILED', ...entry });
}

const issueRoot = 'uifn/.conduct/issues/SFO-45';
requireText(`${issueRoot}/COMPARABILITY_RUBRIC.md`, [
  'Component API | shadcn/ui',
  'Theming | shadcn/ui',
  'Source ownership | shadcn/ui',
  'Density and information design | Coss UI',
  'Visual finish | Coss UI',
  'Documentation | Coss UI',
  'A dimension passes only when the public package or installed source owns it.',
], 'UIFN_COMPARABILITY_RUBRIC_INCOMPLETE');
requireText(`${issueRoot}/PARITY_INVENTORY.md`, [
  'All 69 public components are in scope',
  'Button',
  'Card',
  'Dialog',
  'Table',
  'core Table explicitly does not own them',
], 'UIFN_COMPARABILITY_INVENTORY_INCOMPLETE');
requireText(`${issueRoot}/PROVENANCE.md`, [
  'No shadcn/ui or Coss UI source, CSS, prose, examples, screenshots, or assets were copied',
  'original uifn work',
], 'UIFN_CLEAN_ROOM_PROVENANCE_INCOMPLETE');

requireText('uifn/theme/src/foundations.ts', [
  'typography:', 'space:', 'control:', 'border:', 'elevation:', 'icon:',
  "token('fontFamily'", "token('shadow'", "token('dimension'", "token('number'",
], 'UIFN_DEFAULT_THEME_FOUNDATION_MISSING');
requireText('uifn/theme/src/provider.ts', ['withFoundations', "'uifn-light'", "'uifn-dark'"], 'UIFN_DEFAULT_THEME_MODE_MISSING');

const wrapperRoots = [
  'uifn/components-react/src/generated',
  'uifn/components-svelte/src/generated',
  'uifn/components-solid/src/generated',
];
for (const wrapperRoot of wrapperRoots) {
  const files = walk(wrapperRoot).filter((file) => /\.(?:ts|svelte)$/.test(file) && !file.endsWith('/index.ts'));
  for (const file of files) {
    const source = read(file);
    if (!source.includes('openComponentPartRecipe')) {
      failures.push({ code: 'UIFN_PUBLIC_RECIPE_NOT_CONSUMED', path: file });
    }
    if (!source.includes("from '@uifn/recipes/component'")) {
      failures.push({ code: 'UIFN_LIGHTWEIGHT_RECIPE_ENTRY_NOT_CONSUMED', path: file });
    }
  }
}
requireText('uifn/components/src/contracts.ts', [
  "export type StyledVariant", "export type StyledSize", "export type StyledDensity",
  'unstyled?: boolean', 'classes?: StyledClasses', 'styles?: StyledStyles',
], 'UIFN_STYLED_PUBLIC_API_INCOMPLETE');
requireText('uifn/recipes/src/component.ts', [
  "'data-uifn-variant'", "'data-uifn-size'", "'data-uifn-density'", "'data-uifn-unstyled'",
], 'UIFN_STYLED_PUBLIC_RECIPE_INCOMPLETE');
requireText('uifn/recipes/package.json', [
  '"./component"', '"./dist/component.mjs"', '"./dist/component.d.ts"',
], 'UIFN_LIGHTWEIGHT_RECIPE_EXPORT_MISSING');

const catalogCssFiles = walk('uifn/examples').filter((file) => /-workbench\/src\/.*\.css$/.test(file));
const forbiddenSelector = /(?:\.uifn-|\[data-uifn-(?:component|part|overlay-content|nested-overlay)(?:[=\]\s])|\[data-catalog-preview(?:[=\]\s]))/g;
for (const file of catalogCssFiles) {
  const source = read(file);
  const matches = [...source.matchAll(forbiddenSelector)];
  if (matches.length) failures.push({ code: 'UIFN_CATALOG_COMPONENT_SELECTOR', path: file, count: matches.length });
  const unscopedControlReset = source.match(/^\s*(?:a|button|input|textarea|select)(?:\s*,\s*(?:a|button|input|textarea|select))*\s*\{/gm) ?? [];
  if (unscopedControlReset.length) failures.push({ code: 'UIFN_CATALOG_UNSCOPED_CONTROL_SELECTOR', path: file, selectors: unscopedControlReset });
}
for (const framework of ['react', 'svelte', 'solid']) {
  requireText(`uifn/examples/${framework}-workbench/src/${framework === 'svelte' ? 'main.ts' : 'main.tsx'}`, [
    'import "@uifn/components/styles.css";',
  ], 'UIFN_PUBLIC_STYLESHEET_IMPORT_MISSING');
}
requireText('uifn/catalogs/svelte/src/routes/+layout.ts', [
  'import "@uifn/components/styles.css";',
], 'UIFN_PUBLIC_STYLESHEET_IMPORT_MISSING');
requireText('uifn/components/src/styles.css', [
  'border-inline-end: .125rem solid currentColor;',
  'backdrop-filter: blur(4px);',
  'z-index: 50;',
  '@keyframes uifn-button-spin',
  '[data-state="indeterminate"]:not(:has(svg, img))',
  'transform: translateX(-1.25rem)',
  '[data-uifn-component="tabs"][data-uifn-part="indicator"]',
  '[data-uifn-component="command"][data-uifn-part="root"])::before',
], 'UIFN_STYLED_CSS_ENCODING_UNSAFE');
requireText('uifn/examples/shared/src/catalog-theme.ts', ['themeToVars', 'getTheme', 'uifn-light', 'uifn-dark'], 'UIFN_CATALOG_PUBLIC_THEME_MISSING');

const pilotSource = read('uifn/components/src/pilots.ts');
for (const pilot of ['button', 'field', 'input', 'checkbox', 'switch', 'select', 'combobox', 'dialog', 'menu', 'tabs', 'card', 'table']) {
  if (!new RegExp(`\\b${pilot}: \\[`).test(pilotSource)) failures.push({ code: 'UIFN_STYLED_PILOT_MISSING', pilot });
}
for (const fixture of ['variant-secondary', 'variant-outline', 'variant-ghost', 'variant-danger', 'size-sm', 'size-lg', 'density-compact', 'open', 'checked', 'invalid', 'disabled']) {
  if (!pilotSource.includes(`'${fixture}'`)) failures.push({ code: 'UIFN_STYLED_PILOT_STATE_MISSING', fixture });
}

const registrySource = read('uifn/registry/src/generated/catalog.ts');
if (!registrySource.includes('openComponentPartRecipe') || !registrySource.includes("@uifn/recipes/component") || !registrySource.includes('StyledComponentProps')) {
  failures.push({ code: 'UIFN_PACKAGE_SOURCE_RECIPE_PARITY_MISSING' });
}
requireText('uifn/examples/shared/src/catalog-presentation.ts', [
  '<ButtonSpinner aria-hidden="true">Saving</ButtonSpinner>',
  '<CardTitle>Release health</CardTitle>',
  '<DialogTitle>Edit profile</DialogTitle>',
  '<TableCaption>Production environments and their current release health.</TableCaption>',
  "title: 'Deployment dashboard'",
  "title: 'Nested confirmation dialog'",
  "title: 'Composition-safe keyboard control'",
], 'UIFN_FLAGSHIP_DOCUMENTATION_INCOMPLETE');
requireText('uifn/examples/shared/src/component-inventory.ts', [
  "['table', ['inspect-semantic-structure', 'keyboard', 'scroll', 'resize-viewport']]",
  'applicationOwnsDataOperations: true',
  'semantic-table-structure',
], 'UIFN_TABLE_OWNERSHIP_CONTRACT_INCOMPLETE');

const review = json(`${issueRoot}/VISUAL_REVIEW.json`);
if (!allowPendingReview && (review.reviewStatus !== 'accepted' || !review.reviewer || !review.reviewedAt || review.artifacts.length === 0)) {
  failures.push({ code: 'UIFN_VISUAL_REVIEW_PENDING', reviewStatus: review.reviewStatus, artifactCount: review.artifacts.length });
}
if (!['light', 'dark'].every((theme) => review.requiredThemes.includes(theme))) failures.push({ code: 'UIFN_VISUAL_THEME_MATRIX_INCOMPLETE' });
if (!['react', 'svelte', 'solid'].every((framework) => review.requiredFrameworks.includes(framework))) failures.push({ code: 'UIFN_VISUAL_FRAMEWORK_MATRIX_INCOMPLETE' });

const browserReview = json(`${issueRoot}/BROWSER_REVIEW.json`);
if (
  browserReview.status !== 'passed'
  || browserReview.catalogBlankParity !== true
  || browserReview.crossFrameworkRecipeParity !== true
  || browserReview.presentationIntegrity !== true
  || browserReview.results?.length !== 72
  || browserReview.artifacts?.length !== 12
  || browserReview.failures?.length !== 0
) {
  failures.push({
    code: 'UIFN_BROWSER_VISUAL_MATRIX_INCOMPLETE',
    status: browserReview.status,
    presentationIntegrity: browserReview.presentationIntegrity,
    resultCount: browserReview.results?.length ?? 0,
    artifactCount: browserReview.artifacts?.length ?? 0,
    failureCount: browserReview.failures?.length ?? 0,
  });
}
for (const artifact of browserReview.artifacts ?? []) {
  if (!existsSync(path.join(root, artifact.path))) {
    failures.push({ code: 'UIFN_BROWSER_VISUAL_ARTIFACT_MISSING', path: artifact.path });
  }
}

if (!staticOnly) {
  const node = process.env.UIFN_NODE_PATH ?? '/opt/homebrew/bin/node';
  const npm = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
  command(node, ['scripts/generate-uifn-phase-15.mjs', '--check']);
  command(node, ['scripts/generate-uifn-phase-16.mjs', '--check']);
  for (const workspace of ['@uifn/tokens', '@uifn/theme', '@uifn/components', '@uifn/components-react', '@uifn/components-svelte', '@uifn/components-solid']) {
    command(npm, ['--workspace', workspace, 'run', 'typecheck']);
    command(npm, ['--workspace', workspace, 'run', 'test']);
  }
  command(npm, ['--workspace', '@uifn/examples-shared', 'run', 'build']);
  for (const workspace of ['@uifn/example-react-workbench', '@uifn/example-svelte-workbench', '@uifn/example-solid-workbench']) {
    command(npm, ['--workspace', workspace, 'run', 'build']);
  }
}

const result = {
  ok: failures.length === 0,
  command: 'verify:uifn-styled-comparability',
  modes: { staticOnly, allowPendingReview },
  requirementGroups: {
    rubric: failures.every((failure) => !failure.code.includes('RUBRIC')),
    theme: failures.every((failure) => !failure.code.includes('THEME') && !failure.code.includes('FOUNDATION')),
    recipes: failures.every((failure) => !failure.code.includes('RECIPE') && !failure.code.includes('API')),
    catalogIsolation: failures.every((failure) => !failure.code.includes('CATALOG_COMPONENT_SELECTOR')),
    pilots: failures.every((failure) => !failure.code.includes('PILOT')),
    packageSourceParity: failures.every((failure) => !failure.code.includes('PACKAGE_SOURCE')),
    provenance: failures.every((failure) => !failure.code.includes('PROVENANCE')),
    visualApproval: failures.every((failure) => !failure.code.includes('VISUAL')),
  },
  verificationSeparation: {
    functionalAndAccessibility: 'commands and existing phase/browser gates',
    visualApproval: `${issueRoot}/VISUAL_REVIEW.json`,
  },
  catalogCssFiles,
  browserReview: {
    status: browserReview.status,
    presentationIntegrity: browserReview.presentationIntegrity,
    resultCount: browserReview.results?.length ?? 0,
    artifactCount: browserReview.artifacts?.length ?? 0,
  },
  checks,
  failures,
};

console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
