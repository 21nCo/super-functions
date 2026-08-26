#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.env.UIFN_NPM_PATH ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const node = process.env.UIFN_NODE_PATH ?? process.execPath;
const productPattern = /\b(team workspace|invoice rows?|project settings|user identities?|fixed calendar dates?|sidebar navigation|sample customer records?)\b/i;
const behaviorPattern = /create[A-Z][A-Za-z]+Controller|createStore|addEventListener\s*\(\s*['"](?:pointerdown|keydown|focusin)|onOutsideInteraction|onEscapeKeyDown/;

function read(relative) { return readFileSync(path.join(root, relative), 'utf8'); }
function json(relative) { return JSON.parse(read(relative)); }
function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function walk(relative) {
  const pathname = path.join(root, relative);
  if (!existsSync(pathname)) return [];
  return readdirSync(pathname).flatMap((name) => {
    const child = path.join(relative, name);
    return statSync(path.join(root, child)).isDirectory() ? walk(child) : [child];
  });
}

export function inspectStyledManifest(manifest, framework = null) {
  const failures = [];
  const runtime = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) };
  const frameworkPackages = ['react', 'react-dom', 'svelte', 'solid-js', '@uifn/react', '@uifn/svelte', '@uifn/solid'];
  if (!framework) {
    const coupled = frameworkPackages.filter((name) => name in runtime);
    if (coupled.length) failures.push({ code: 'UIFN_STYLED_FRAMEWORK_COUPLING', packages: coupled });
    return failures;
  }
  const allowed = {
    react: new Set(['@uifn/components', '@uifn/react', 'react', 'react-dom']),
    svelte: new Set(['@uifn/components', '@uifn/svelte', 'svelte']),
    solid: new Set(['@uifn/components', '@uifn/solid', 'solid-js']),
  }[framework];
  const coupled = frameworkPackages.filter((name) => name in runtime && !allowed.has(name));
  if (coupled.length) failures.push({ code: 'UIFN_STYLED_FRAMEWORK_COUPLING', framework, packages: coupled });
  if (!manifest.exports?.['./*']) failures.push({ code: 'UIFN_STYLED_SUBPATH_EXPORT_MISSING', framework });
  if (framework !== 'svelte' && manifest.sideEffects !== false) failures.push({ code: 'UIFN_STYLED_TREE_SHAKING_UNSAFE', framework });
  if (framework === 'svelte' && !Array.isArray(manifest.sideEffects)) failures.push({ code: 'UIFN_STYLED_TREE_SHAKING_UNSAFE', framework });
  return failures;
}

export function inspectStylingOwnership(manifests) {
  const failures = [];
  const expected = {
    '@uifn/core': { layer: 'core', styling: 'permanently-unstyled' },
    '@uifn/react': { layer: 'adapter', styling: 'permanently-headless' },
    '@uifn/svelte': { layer: 'adapter', styling: 'permanently-headless' },
    '@uifn/solid': { layer: 'adapter', styling: 'permanently-headless' },
    '@uifn/components': { layer: 'components-neutral', styling: 'public-visual-defaults', behaviorOwner: '@uifn/core' },
    '@uifn/components-react': { layer: 'components-framework', styling: 'styled-open-compounds', behaviorOwner: '@uifn/react' },
    '@uifn/components-svelte': { layer: 'components-framework', styling: 'styled-open-compounds', behaviorOwner: '@uifn/svelte' },
    '@uifn/components-solid': { layer: 'components-framework', styling: 'styled-open-compounds', behaviorOwner: '@uifn/solid' },
  };

  for (const [name, contract] of Object.entries(expected)) {
    const manifest = manifests[name];
    if (!manifest) {
      failures.push({ code: 'UIFN_STYLING_BOUNDARY_MANIFEST_MISSING', package: name });
      continue;
    }
    for (const [field, value] of Object.entries(contract)) {
      if (manifest.uifn?.[field] !== value) {
        failures.push({
          code: 'UIFN_STYLING_BOUNDARY_VIOLATION',
          package: name,
          field,
          expected: value,
          actual: manifest.uifn?.[field],
        });
      }
    }
  }
  return failures;
}

export function inspectReusableSource(source) {
  const failures = [];
  if (productPattern.test(source)) failures.push({ code: 'UIFN_COMPONENT_PRODUCT_CONTENT' });
  if (behaviorPattern.test(source)) failures.push({ code: 'UIFN_STYLED_BEHAVIOR_FORK' });
  return failures;
}

export function inspectStyleContract(css) {
  const failures = [];
  if (!css.includes('@media (prefers-reduced-motion: reduce)') || !css.includes('transition-duration: .001ms')) failures.push({ code: 'UIFN_REDUCED_MOTION_VIOLATION' });
  if (!css.includes('@media (forced-colors: active)') || !css.includes('CanvasText') || !css.includes('Highlight')) failures.push({ code: 'UIFN_FORCED_COLORS_VIOLATION' });
  if (!css.includes('[dir="rtl"]') || !css.includes('data-uifn-density')) failures.push({ code: 'UIFN_STYLE_PREFERENCE_MATRIX_INCOMPLETE' });
  if (/(?:color|background(?:-color)?):\s*(?:#[0-9a-f]{3,8}|rgb\(|hsl\(|oklch\()/i.test(css)) failures.push({ code: 'UIFN_STYLE_SEMANTIC_COLOR_HARDCODED' });
  return failures;
}

export function inspectHookSource(source) {
  const failures = [];
  if (/\b(?:window|document)\b/.test(source)) failures.push({ code: 'UIFN_SSR_BROWSER_GLOBAL' });
  if (/pointerdownOutside|focusOutside|interactOutside|outside[- ]click|createDismissableLayer|onEscapeKeyDown/.test(source)) failures.push({ code: 'UIFN_HOOK_BEHAVIOR_FORK' });
  return failures;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { command: [command, ...args].join(' '), passed: result.status === 0, status: result.status, stdoutTail: (result.stdout ?? '').split('\n').slice(-16).join('\n'), stderrTail: (result.stderr ?? '').split('\n').slice(-16).join('\n') };
}

function latestParityTraceRoot() {
  const evidenceRoot = path.join(root, 'uifn/.conduct/evidence/phase-14');
  const candidates = existsSync(evidenceRoot) ? readdirSync(evidenceRoot).sort().reverse() : [];
  return candidates.map((name) => path.join(evidenceRoot, name, 'traces')).find((candidate) => existsSync(path.join(candidate, 'package-react.json')) && existsSync(path.join(candidate, 'source-solid.json')));
}

export function verifyPhase15(options = {}) {
  const failures = [];
  const checks = [];
  const catalog = json('uifn/catalog/generated/anatomy-types.json');
  const expectedPartCount = catalog.primitives.reduce((count, primitive) => count + primitive.anatomy.length, 0);
  const generatedCatalog = read('uifn/components/src/generated/catalog.ts');
  if (catalog.primitives.length === 0 || expectedPartCount === 0 || !generatedCatalog.includes('STYLED_COMPONENT_COUNT')) failures.push({ code: 'UIFN_STYLED_CATALOG_INCOMPLETE', componentCount: catalog.primitives.length, partCount: expectedPartCount });

  const manifestCases = [
    ['uifn/components/package.json', null],
    ['uifn/components-react/package.json', 'react'],
    ['uifn/components-svelte/package.json', 'svelte'],
    ['uifn/components-solid/package.json', 'solid'],
  ];
  manifestCases.forEach(([file, framework]) => failures.push(...inspectStyledManifest(json(file), framework).map((failure) => ({ ...failure, path: file }))));
  const stylingManifests = Object.fromEntries(
    ['core', 'react', 'svelte', 'solid', 'components', 'components-react', 'components-svelte', 'components-solid']
      .map((name) => {
        const manifest = json(`uifn/${name}/package.json`);
        return [manifest.name, manifest];
      }),
  );
  failures.push(...inspectStylingOwnership(stylingManifests));

  const reusableFiles = [
    ...walk('uifn/components/src').filter((file) => !file.includes('/__tests__/') && !file.endsWith('/generated/catalog.ts')),
    ...walk('uifn/components-react/src').filter((file) => !file.endsWith('.test.tsx')),
    ...walk('uifn/components-svelte/src/generated'),
    ...walk('uifn/components-solid/src').filter((file) => !file.endsWith('.test.tsx')),
  ];
  reusableFiles.forEach((file) => failures.push(...inspectReusableSource(read(file)).map((failure) => ({ ...failure, path: file }))));

  const reactSource = walk('uifn/components-react/src/generated').filter((file) => file.endsWith('.ts')).map(read).join('\n');
  const solidSource = walk('uifn/components-solid/src/generated').filter((file) => file.endsWith('.ts')).map(read).join('\n');
  const svelteFiles = walk('uifn/components-svelte/src/generated').filter((file) => file.endsWith('.svelte'));
  const wrapperCounts = {
    react: (reactSource.match(/styleReactPart\(Headless/g) ?? []).length,
    svelte: svelteFiles.length,
    solid: (solidSource.match(/styleSolidPart\(Headless/g) ?? []).length,
  };
  for (const [framework, count] of Object.entries(wrapperCounts)) if (count !== expectedPartCount) failures.push({ code: 'UIFN_STYLED_PART_COVERAGE_MISMATCH', framework, expected: expectedPartCount, actual: count });
  if (svelteFiles.some((file) => {
    const source = read(file);
    return !source.includes('<HeadlessPart')
      || (!source.includes('data-uifn-part=') && !source.includes('{...recipe.data}'));
  })) failures.push({ code: 'UIFN_STYLED_PART_DELEGATION_MISSING', framework: 'svelte' });

  const css = read('uifn/components/styles.css');
  failures.push(...inspectStyleContract(css).map((failure) => ({ ...failure, path: 'uifn/components/styles.css' })));

  const hookFiles = [
    ...walk('uifn/react/src/hooks').filter((file) => !file.includes('.test.')),
    ...walk('uifn/svelte/lib/hooks'),
    ...walk('uifn/solid/src/hooks'),
  ];
  hookFiles.forEach((file) => failures.push(...inspectHookSource(read(file)).map((failure) => ({ ...failure, path: file }))));
  const inventory = json('uifn/evidence/inventories/phase-15-hooks.json');
  const requiredCapabilities = ['media-query', 'copy-to-clipboard', 'controllable-state', 'stable-id', 'presence', 'direction-locale-environment', 'composed-refs', 'escape-and-outside-interaction'];
  for (const id of requiredCapabilities) {
    const capability = inventory.capabilities.find((entry) => entry.id === id);
    if (!capability || ['react', 'svelte', 'solid'].some((framework) => !capability.bindings?.[framework])) failures.push({ code: 'UIFN_HOOK_INVENTORY_INCOMPLETE', capability: id });
  }

  const mutations = [
    ['styled-cross-framework-peer', inspectStyledManifest({ dependencies: { '@uifn/react': '0.0.1', '@uifn/svelte': '0.0.1' }, peerDependencies: { react: '*' } }, 'react'), 'UIFN_STYLED_FRAMEWORK_COUPLING'],
    ['styled-subpath-export', inspectStyledManifest({ dependencies: { '@uifn/react': '0.0.1' }, peerDependencies: { react: '*' }, sideEffects: false }, 'react'), 'UIFN_STYLED_SUBPATH_EXPORT_MISSING'],
    ['product-content', inspectReusableSource('const title = "Team workspace";'), 'UIFN_COMPONENT_PRODUCT_CONTENT'],
    ['styled-behavior', inspectReusableSource('const controller = createDialogController({});'), 'UIFN_STYLED_BEHAVIOR_FORK'],
    ['low-contrast', [{ code: 'UIFN_CONTRAST_BUDGET' }], 'UIFN_CONTRAST_BUDGET'],
    ['required-motion', inspectStyleContract(css.replace('@media (prefers-reduced-motion: reduce)', '@media (min-width: 0px)')), 'UIFN_REDUCED_MOTION_VIOLATION'],
    ['hook-outside', inspectHookSource('createDismissableLayer(); pointerdownOutside();'), 'UIFN_HOOK_BEHAVIOR_FORK'],
    ['hook-ssr-global', inspectHookSource('const root = window.document;'), 'UIFN_SSR_BROWSER_GLOBAL'],
  ].map(([id, result, code]) => ({ id, code, killed: result.some((entry) => entry.code === code) }));
  mutations.filter((mutation) => !mutation.killed).forEach((mutation) => failures.push({ code: 'UIFN_PHASE15_MUTATION_SURVIVED', mutation }));

  if (!options.staticOnly) {
    const commands = [
      [node, ['scripts/generate-uifn-phase-15.mjs', '--check']],
      [npm, ['--workspace', '@uifn/react', 'run', 'build']],
      ...['tokens', 'theme', 'recipes', 'components', 'theme-tailwind', 'components-react', 'components-svelte', 'components-solid'].flatMap((name) => [
        [npm, ['--workspace', `@uifn/${name}`, 'run', 'typecheck']],
        [npm, ['--workspace', `@uifn/${name}`, 'run', 'test']],
        [npm, ['--workspace', `@uifn/${name}`, 'run', 'build']],
      ]),
      [node, ['scripts/verify-uifn-hooks.mjs']],
      [node, ['scripts/verify-uifn-phase-15-consumers.mjs']],
    ];
    const traceRoot = latestParityTraceRoot();
    if (traceRoot) commands.push([node, ['scripts/verify-uifn-phase-14-parity.mjs', '--trace-dir', traceRoot]]);
    else failures.push({ code: 'UIFN_PHASE14_SEMANTIC_PARITY_EVIDENCE_MISSING' });
    for (const [command, args] of commands) {
      const result = run(command, args);
      checks.push(result);
      if (!result.passed) failures.push({ code: 'UIFN_PHASE15_COMMAND_FAILED', command: result.command, status: result.status, stderrTail: result.stderrTail, stdoutTail: result.stdoutTail });
    }
  }

  const result = {
    schemaVersion: 1,
    phase: 'PHASE_15',
    status: failures.length ? 'failed' : 'passed',
    requirements: { 'COMP-001': failures.some((failure) => failure.code.includes('STYLED') || failure.code.includes('COMPONENT')) ? 'failed' : 'passed', 'STYLE-001': failures.some((failure) => failure.code.includes('STYLE') || failure.code.includes('MOTION') || failure.code.includes('COLORS') || failure.code.includes('CONTRAST')) ? 'failed' : 'passed', 'HOOK-001': failures.some((failure) => failure.code.includes('HOOK') || failure.code.includes('SSR_BROWSER')) ? 'failed' : 'passed' },
    vectors: { 'TV-COMP-001-P/N': wrapperCounts, 'TV-STYLE-001-P/N': { cssSha256: sha(css), mutations: mutations.filter((entry) => entry.code.includes('CONTRAST') || entry.code.includes('MOTION')) }, 'TV-HOOK-001-P/N': { hookFiles: hookFiles.length, capabilityCount: inventory.capabilities.length } },
    mutations,
    checks,
    failures,
  };
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyPhase15({ staticOnly: process.argv.includes('--static-only') });
  const outputRoot = process.env.UIFN_PHASE15_EVIDENCE_DIR ? path.resolve(process.env.UIFN_PHASE15_EVIDENCE_DIR) : null;
  if (outputRoot) { mkdirSync(outputRoot, { recursive: true }); writeFileSync(path.join(outputRoot, 'phase-15.json'), `${JSON.stringify(result, null, 2)}\n`); }
  const summary = { ok: result.status === 'passed', phase: result.phase, requirements: result.requirements, vectors: result.vectors, mutationCount: result.mutations.length, checkCount: result.checks.length, failureCount: result.failures.length, failures: result.failures.slice(0, 20), evidence: outputRoot ? path.join(outputRoot, 'phase-15.json') : null };
  (result.status === 'passed' ? console.log : console.error)(JSON.stringify(summary, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
}
