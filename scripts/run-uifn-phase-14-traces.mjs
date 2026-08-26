#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { phase14ArtifactSetHash } from './verify-uifn-phase-14-compat.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmPath = process.env.UIFN_NPM_PATH ?? '/opt/homebrew/bin/npm';
const catalog = JSON.parse(
  readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'),
);
const expectedPrimitiveCount = catalog.primitives.length;
const outputArgument = process.argv.indexOf('--output-dir');
const outputRoot = path.resolve(
  outputArgument >= 0 && process.argv[outputArgument + 1]
    ? process.argv[outputArgument + 1]
    : path.join(tmpdir(), `uifn-phase-14-traces-${Date.now()}`),
);
const workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'uifn-phase-14-package-')));
const packRoot = path.join(workspace, 'tarballs');
const outputTarballRoot = path.join(outputRoot, 'tarballs');
const outputConsumerKitRoot = path.join(outputRoot, 'consumer-kit');
const consumerRoot = path.join(workspace, 'consumer');
const npmCache = path.join(workspace, 'npm-cache');
mkdirSync(outputRoot, { recursive: true });
mkdirSync(packRoot, { recursive: true });
mkdirSync(outputTarballRoot, { recursive: true });
mkdirSync(consumerRoot, { recursive: true });

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: { ...process.env, ...options.env },
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    command: [command, ...args].join(' '),
    cwd: options.cwd ?? repoRoot,
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function requireSuccess(result) {
  if (result.ok) return;
  throw new Error(`${result.command} failed (${result.status}).\n${result.stdout}\n${result.stderr}`);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function readTrace(file, framework, installMode) {
  const traces = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(traces) || traces.length !== expectedPrimitiveCount) {
    throw new Error(
      `${framework}/${installMode} MUST produce exactly ${expectedPrimitiveCount} traces; received ${traces.length}.`,
    );
  }
  for (const trace of traces) {
    if (trace.framework !== framework || trace.installMode !== installMode || trace.result !== 'passed') {
      throw new Error(`${framework}/${installMode}/${trace.primitive ?? 'unknown'} emitted invalid trace metadata.`);
    }
  }
  return traces;
}

function transform(sourcePath, replacements) {
  let source = readFileSync(sourcePath, 'utf8');
  for (const [before, after] of replacements) {
    if (!source.includes(before)) throw new Error(`Package fixture transform source is stale: ${before}`);
    source = source.replaceAll(before, after);
  }
  return source;
}

function installedFrameworkVersion(root, framework) {
  const packageName = framework === 'solid' ? 'solid-js' : framework;
  return JSON.parse(readFileSync(path.join(root, 'node_modules', packageName, 'package.json'), 'utf8')).version;
}

function pack(packageName) {
  const result = run(npmPath, ['pack', '--workspace', packageName, '--json', '--pack-destination', packRoot], {
    env: { NPM_CONFIG_CACHE: npmCache },
  });
  requireSuccess(result);
  let parsed;
  for (let index = result.stdout.lastIndexOf('['); index >= 0; index = result.stdout.lastIndexOf('[', index - 1)) {
    try {
      const candidate = JSON.parse(result.stdout.slice(index));
      if (Array.isArray(candidate) && candidate[0]?.filename) {
        parsed = candidate;
        break;
      }
    } catch {
      // npm lifecycle output can precede the final JSON payload.
    }
  }
  if (!parsed) throw new Error(`npm pack did not return JSON for ${packageName}.`);
  const file = path.join(packRoot, parsed[0].filename);
  return { package: packageName, file, filename: parsed[0].filename, sha256: sha256(file) };
}

const commands = [];
const sourceTraces = [];
const sourceRuns = [
  {
    framework: 'react',
    workspace: '@uifn/react',
    args: ['test', '--workspace=@uifn/react', '--', '--run', 'src/__tests__/phase-14-public-parity.test.tsx'],
  },
  {
    framework: 'svelte',
    workspace: '@uifn/svelte',
    args: ['test', '--workspace=@uifn/svelte', '--', '--run', 'tests/phase-14-public-parity.test.ts'],
  },
  {
    framework: 'solid',
    workspace: '@uifn/solid',
    args: ['exec', '--workspace=@uifn/solid', '--', 'vitest', 'run', '--config', 'vitest.config.ts', 'src/__tests__/phase-14-public-parity.test.tsx'],
  },
];

for (const sourceRun of sourceRuns) {
  const traceFile = path.join(outputRoot, `source-${sourceRun.framework}.json`);
  const result = run(npmPath, sourceRun.args, {
    env: {
      UIFN_PHASE14_INSTALL_MODE: 'source',
      UIFN_PHASE14_TRACE_OUT: traceFile,
    },
  });
  commands.push(result);
  requireSuccess(result);
  sourceTraces.push(...readTrace(traceFile, sourceRun.framework, 'source'));
}

const packages = [
  '@uifn/core',
  '@uifn/dom',
  '@uifn/adapter-kit',
  '@uifn/react',
  '@uifn/svelte',
  '@uifn/solid',
].map(pack);
const frozenPackages = packages.map((entry) => {
  copyFileSync(entry.file, path.join(outputTarballRoot, entry.filename));
  return { package: entry.package, filename: entry.filename, sha256: entry.sha256 };
});
writeFileSync(
  path.join(outputTarballRoot, 'SHA256SUMS'),
  `${frozenPackages.map((entry) => `${entry.sha256}  ${entry.filename}`).join('\n')}\n`,
);

const packageDependencies = Object.fromEntries(packages.map((entry) => [entry.package, `file:${entry.file}`]));
Object.assign(packageDependencies, {
  '@sveltejs/vite-plugin-svelte': '4.0.4',
  '@testing-library/react': '15.0.7',
  '@testing-library/svelte': '5.3.1',
  'jsdom': '27.0.1',
  'playwright': '1.57.0',
  'react': '18.3.1',
  'react-dom': '18.3.1',
  'solid-js': '1.9.13',
  'svelte': '5.46.4',
  'vite': '5.4.21',
  'vite-plugin-solid': '2.11.12',
  'vitest': '3.2.4',
});
writeFileSync(path.join(consumerRoot, 'package.json'), `${JSON.stringify({
  name: 'uifn-phase-14-packed-public-trees',
  private: true,
  type: 'module',
  dependencies: packageDependencies,
}, null, 2)}\n`);

const install = run(npmPath, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: consumerRoot,
  env: { NPM_CONFIG_CACHE: npmCache },
});
commands.push(install);
requireSuccess(install);

copyFileSync(
  path.join(repoRoot, 'uifn/evidence/generated/phase-14/phase-14-public-vectors.json'),
  path.join(consumerRoot, 'vectors.json'),
);
writeFileSync(path.join(consumerRoot, 'trace.mjs'), transform(
  path.join(repoRoot, 'uifn/parity/src/trace.mjs'),
  [["../../adapter-kit/src/conformance.ts", '@uifn/adapter-kit']],
));

writeFileSync(path.join(consumerRoot, 'react.test.tsx'), transform(
  path.join(repoRoot, 'uifn/react/src/__tests__/phase-14-public-parity.test.tsx'),
  [
    ['../../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../../parity/src/trace.mjs', './trace.mjs'],
    ["'./fixtures/phase-14-public-tree'", "'./Phase14ReactPublicTree'"],
  ],
));
writeFileSync(path.join(consumerRoot, 'react-ssr.test.tsx'), transform(
  path.join(repoRoot, 'uifn/react/src/__tests__/phase-14-ssr-hydration.test.tsx'),
  [
    ['../../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../../parity/src/trace.mjs', './trace.mjs'],
    ["'./fixtures/phase-14-public-tree'", "'./Phase14ReactPublicTree'"],
  ],
));
writeFileSync(path.join(consumerRoot, 'Phase14ReactPublicTree.ts'), transform(
  path.join(repoRoot, 'uifn/react/src/__tests__/fixtures/phase-14-public-tree.ts'),
  [
    ['../../../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../../../parity/src/trace.mjs', './trace.mjs'],
    ["from '../../index'", "from '@uifn/react'"],
    [
      "import type { ReactPrimitiveBridge, ReactPrimitiveRenderPayload } from '../../internal/compound';",
      'type ReactPrimitiveBridge = any;\ntype ReactPrimitiveRenderPayload = any;',
    ],
  ],
));
writeFileSync(path.join(consumerRoot, 'svelte.test.ts'), transform(
  path.join(repoRoot, 'uifn/svelte/tests/phase-14-public-parity.test.ts'),
  [
    ['../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../parity/src/trace.mjs', './trace.mjs'],
    ["'./fixtures/Phase14PublicTreeHarness.svelte'", "'./Phase14PublicTreeHarness.svelte'"],
    [
      "import type { SveltePrimitiveBridge } from '../lib/internal/compound.js';",
      'type SveltePrimitiveBridge = any;',
    ],
  ],
));
writeFileSync(path.join(consumerRoot, 'Phase14PublicTreeHarness.svelte'), transform(
  path.join(repoRoot, 'uifn/svelte/tests/fixtures/Phase14PublicTreeHarness.svelte'),
  [
    ["'../../lib/index.js'", "'@uifn/svelte'"],
    ["'../../../parity/src/trace.mjs'", "'./trace.mjs'"],
  ],
));
writeFileSync(path.join(consumerRoot, 'solid.test.tsx'), transform(
  path.join(repoRoot, 'uifn/solid/src/__tests__/phase-14-public-parity.test.tsx'),
  [
    ['../../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../../parity/src/trace.mjs', './trace.mjs'],
    ["'./fixtures/phase-14-public-tree.jsx'", "'./Phase14SolidPublicTree.tsx'"],
    [
      "import type { SolidPrimitiveBridge } from '../internal/compound.jsx';",
      'type SolidPrimitiveBridge = any;',
    ],
  ],
));
writeFileSync(path.join(consumerRoot, 'Phase14SolidPublicTree.tsx'), transform(
  path.join(repoRoot, 'uifn/solid/src/__tests__/fixtures/phase-14-public-tree.tsx'),
  [
    ['../../../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../../../../parity/src/trace.mjs', './trace.mjs'],
    ["from '../../index.js'", "from '@uifn/solid'"],
    [
      "import type { SolidPrimitiveBridge, SolidPrimitiveRenderPayload } from '../../internal/compound.jsx';",
      'type SolidPrimitiveBridge = any;\ntype SolidPrimitiveRenderPayload = any;',
    ],
  ],
));

for (const file of ['index.html', 'main.ts', 'runtime.ts', 'profile.ts', 'vite.config.mjs']) {
  const destination = file === 'main.ts' ? 'browser-main.ts'
    : file === 'runtime.ts' ? 'browser-runtime.ts'
    : file === 'profile.ts' ? 'browser-profile.ts'
    : file === 'vite.config.mjs' ? 'browser-vite.config.mjs'
    : file;
  const replacements = file === 'main.ts'
    ? [["'./profile'", "'./browser-profile'"], ["'./react'", "'./browser-react'"], ["'./svelte'", "'./browser-svelte'"], ["'./solid'", "'./browser-solid'"]]
    : file === 'runtime.ts'
      ? [['../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json']]
      : file === 'index.html'
        ? [['/browser-main.ts', '/browser-main.ts']]
        : [];
  writeFileSync(path.join(consumerRoot, destination), transform(path.join(repoRoot, 'uifn/parity/browser', file), replacements));
}
writeFileSync(path.join(consumerRoot, 'browser-react.ts'), transform(
  path.join(repoRoot, 'uifn/parity/browser/react.ts'),
  [
    ['../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../src/trace.mjs', './trace.mjs'],
    ["import type { ReactPrimitiveBridge } from '../../react/src/internal/compound';", 'type ReactPrimitiveBridge = any;'],
    ["'../../react/src/__tests__/fixtures/phase-14-public-tree'", "'./Phase14ReactPublicTree'"],
    ["'./runtime'", "'./browser-runtime'"],
  ],
));
writeFileSync(path.join(consumerRoot, 'browser-svelte.ts'), transform(
  path.join(repoRoot, 'uifn/parity/browser/svelte.ts'),
  [
    ['../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../src/trace.mjs', './trace.mjs'],
    ["import type { SveltePrimitiveBridge } from '../../svelte/lib/internal/compound.js';", 'type SveltePrimitiveBridge = any;'],
    ["'../../svelte/tests/fixtures/Phase14PublicTreeHarness.svelte'", "'./Phase14PublicTreeHarness.svelte'"],
    ["'./runtime'", "'./browser-runtime'"],
    ['__UIFN_SVELTE_VERSION__', installedFrameworkVersion(consumerRoot, 'svelte')],
  ],
));
writeFileSync(path.join(consumerRoot, 'browser-solid.tsx'), transform(
  path.join(repoRoot, 'uifn/parity/browser/solid.tsx'),
  [
    ['../../evidence/generated/phase-14/phase-14-public-vectors.json', './vectors.json'],
    ['../src/trace.mjs', './trace.mjs'],
    ["import type { SolidPrimitiveBridge } from '../../solid/src/internal/compound.jsx';", 'type SolidPrimitiveBridge = any;'],
    ["'../../solid/src/__tests__/fixtures/phase-14-public-tree.jsx'", "'./Phase14SolidPublicTree'"],
    ["'./runtime'", "'./browser-runtime'"],
    ['__UIFN_SOLID_VERSION__', installedFrameworkVersion(consumerRoot, 'solid')],
  ],
));

const solidSsrTestRoot = path.join(consumerRoot, 'src', '__tests__');
const solidSsrFixtureRoot = path.join(solidSsrTestRoot, 'fixtures');
mkdirSync(solidSsrFixtureRoot, { recursive: true });
writeFileSync(path.join(solidSsrFixtureRoot, 'phase-14-public-tree.tsx'), transform(
  path.join(repoRoot, 'uifn/solid/src/__tests__/fixtures/phase-14-public-tree.tsx'),
  [
    ['../../../../evidence/generated/phase-14/phase-14-public-vectors.json', '../../../vectors.json'],
    ['../../../../parity/src/trace.mjs', '../../../trace.mjs'],
    ["from '../../index.js'", "from '@uifn/solid'"],
    [
      "import type { SolidPrimitiveBridge, SolidPrimitiveRenderPayload } from '../../internal/compound.jsx';",
      'type SolidPrimitiveBridge = any;\ntype SolidPrimitiveRenderPayload = any;',
    ],
  ],
));
for (const [source, destination] of [
  ['phase-14-ssr-entry.tsx', 'phase-14-ssr-entry.tsx'],
  ['phase-14-browser-hydrate.tsx', 'phase-14-browser-hydrate.tsx'],
]) {
  writeFileSync(path.join(solidSsrTestRoot, destination), transform(
    path.join(repoRoot, 'uifn/solid/src/__tests__', source),
    [
      ['../../../evidence/generated/phase-14/phase-14-public-vectors.json', '../../vectors.json'],
      ['../../../parity/src/trace.mjs', '../../trace.mjs'],
    ],
  ));
}
copyFileSync(
  path.join(repoRoot, 'uifn/solid/src/__tests__/phase-14-ssr-hydration.mjs'),
  path.join(consumerRoot, 'solid-ssr-hydration.mjs'),
);

writeFileSync(path.join(consumerRoot, 'react.vitest.mjs'), `export default { test: { environment: 'jsdom', include: ['react.test.tsx'] } };\n`);
writeFileSync(path.join(consumerRoot, 'react-ssr.vitest.mjs'), `export default { test: { environment: 'jsdom', include: ['react-ssr.test.tsx'] } };\n`);
writeFileSync(path.join(consumerRoot, 'svelte.vitest.mjs'), `import { svelte } from '@sveltejs/vite-plugin-svelte';\nexport default { plugins: [svelte()], resolve: { conditions: ['browser'] }, test: { environment: 'jsdom', include: ['svelte.test.ts'] } };\n`);
writeFileSync(path.join(consumerRoot, 'solid.vitest.mjs'), `import solid from 'vite-plugin-solid';\nexport default { plugins: [solid({ hot: false })], resolve: { conditions: ['solid', 'browser', 'import'] }, test: { environment: 'jsdom', include: ['solid.test.tsx'] } };\n`);

const packageTraces = [];
const frameworkCompatibilityRuns = [];
for (const framework of ['react', 'svelte', 'solid']) {
  const traceFile = path.join(outputRoot, `package-${framework}.json`);
  const result = run(process.execPath, [
    path.join(consumerRoot, 'node_modules/vitest/vitest.mjs'),
    'run', '--config', `${framework}.vitest.mjs`,
  ], {
    cwd: consumerRoot,
    env: {
      UIFN_PHASE14_INSTALL_MODE: 'package',
      UIFN_PHASE14_TRACE_OUT: traceFile,
    },
  });
  commands.push(result);
  requireSuccess(result);
  const traces = readTrace(traceFile, framework, 'package');
  packageTraces.push(...traces);
  frameworkCompatibilityRuns.push({
    cellId: framework === 'react' ? 'react-18.3-client' : `${framework}-${framework === 'svelte' ? '5' : '1'}-csr`,
    framework,
    version: installedFrameworkVersion(consumerRoot, framework),
    mode: framework === 'react' ? 'client' : 'csr',
    traceFile: path.basename(traceFile),
    traceSha256: sha256(traceFile),
    publicTreeCount: traces.length,
    command: result.command,
  });
}

const svelteSsrRoot = path.join(workspace, 'svelte-ssr-consumer');
const svelteSsrTestsRoot = path.join(svelteSsrRoot, 'tests');
const svelteSsrFixturesRoot = path.join(svelteSsrTestsRoot, 'fixtures');
mkdirSync(svelteSsrFixturesRoot, { recursive: true });
writeFileSync(path.join(svelteSsrRoot, 'package.json'), `${JSON.stringify({
  name: 'uifn-phase-14-svelte-ssr-packed-public-trees',
  private: true,
  type: 'module',
  dependencies: {
    ...Object.fromEntries(packages.filter((entry) => ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit', '@uifn/svelte'].includes(entry.package)).map((entry) => [entry.package, `file:${entry.file}`])),
    '@sveltejs/vite-plugin-svelte': '7.2.0',
    'playwright': '1.57.0',
    'svelte': '5.46.4',
    'vite': '8.1.5',
  },
}, null, 2)}\n`);
for (const file of ['vectors.json', 'trace.mjs']) {
  copyFileSync(path.join(consumerRoot, file), path.join(svelteSsrRoot, file));
}
writeFileSync(path.join(svelteSsrFixturesRoot, 'Phase14PublicTreeSsrHarness.svelte'), transform(
  path.join(repoRoot, 'uifn/svelte/tests/fixtures/Phase14PublicTreeSsrHarness.svelte'),
  [
    ["'../../lib/index.js'", "'@uifn/svelte'"],
    ["'../../../parity/src/trace.mjs'", "'../../trace.mjs'"],
  ],
));
writeFileSync(path.join(svelteSsrFixturesRoot, 'Phase14AccordionSsrHarness.svelte'), transform(
  path.join(repoRoot, 'uifn/svelte/tests/fixtures/Phase14AccordionSsrHarness.svelte'),
  [["'../../lib/index.js'", "'@uifn/svelte'"]],
));
for (const file of ['phase-14-ssr-entry.ts', 'phase-14-browser-hydrate.ts']) {
  writeFileSync(path.join(svelteSsrTestsRoot, file), transform(
    path.join(repoRoot, 'uifn/svelte/tests', file),
    [
      ['../../evidence/generated/phase-14/phase-14-public-vectors.json', '../vectors.json'],
      ['../../parity/src/trace.mjs', '../trace.mjs'],
    ],
  ));
}
copyFileSync(
  path.join(repoRoot, 'uifn/svelte/tests/phase-14-ssr-hydration.mjs'),
  path.join(svelteSsrRoot, 'svelte-ssr-hydration.mjs'),
);
const svelteSsrInstall = run(npmPath, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: svelteSsrRoot,
  env: { NPM_CONFIG_CACHE: npmCache },
});
commands.push(svelteSsrInstall);
requireSuccess(svelteSsrInstall);
const svelteSsrTraceFile = path.join(outputRoot, 'compat-svelte-5-ssr-hydration-package.json');
const svelteSsrRun = run(process.execPath, [
  'svelte-ssr-hydration.mjs',
  '--root', '.',
  '--output', svelteSsrTraceFile,
  '--install-mode', 'package',
], { cwd: svelteSsrRoot });
commands.push(svelteSsrRun);
requireSuccess(svelteSsrRun);
const svelteSsrTraces = readTrace(svelteSsrTraceFile, 'svelte', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'svelte-5-ssr-hydration',
  framework: 'svelte',
  version: installedFrameworkVersion(svelteSsrRoot, 'svelte'),
  mode: 'ssr-hydration',
  traceFile: path.basename(svelteSsrTraceFile),
  traceSha256: sha256(svelteSsrTraceFile),
  publicTreeCount: svelteSsrTraces.length,
  command: svelteSsrRun.command,
});

const solidSsrTraceFile = path.join(outputRoot, 'compat-solid-1-ssr-hydration-package.json');
const solidSsrRun = run(process.execPath, [
  'solid-ssr-hydration.mjs',
  '--root', '.',
  '--output', solidSsrTraceFile,
  '--install-mode', 'package',
], { cwd: consumerRoot });
commands.push(solidSsrRun);
requireSuccess(solidSsrRun);
const solidSsrTraces = readTrace(solidSsrTraceFile, 'solid', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'solid-1-ssr-hydration',
  framework: 'solid',
  version: installedFrameworkVersion(consumerRoot, 'solid'),
  mode: 'ssr-hydration',
  traceFile: path.basename(solidSsrTraceFile),
  traceSha256: sha256(solidSsrTraceFile),
  publicTreeCount: solidSsrTraces.length,
  command: solidSsrRun.command,
});

const react18StrictTraceFile = path.join(outputRoot, 'compat-react-18-strictmode-package.json');
const react18StrictRun = run(process.execPath, [
  path.join(consumerRoot, 'node_modules/vitest/vitest.mjs'),
  'run', '--config', 'react.vitest.mjs',
], {
  cwd: consumerRoot,
  env: {
    UIFN_PHASE14_INSTALL_MODE: 'package',
    UIFN_PHASE14_REACT_STRICT: '1',
    UIFN_PHASE14_TRACE_OUT: react18StrictTraceFile,
  },
});
commands.push(react18StrictRun);
requireSuccess(react18StrictRun);
const react18StrictTraces = readTrace(react18StrictTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-18.3-strictmode',
  framework: 'react',
  version: installedFrameworkVersion(consumerRoot, 'react'),
  mode: 'strictmode',
  traceFile: path.basename(react18StrictTraceFile),
  traceSha256: sha256(react18StrictTraceFile),
  publicTreeCount: react18StrictTraces.length,
  command: react18StrictRun.command,
});
const react18SsrTraceFile = path.join(outputRoot, 'compat-react-18-ssr-hydration-package.json');
const react18SsrRun = run(process.execPath, [
  path.join(consumerRoot, 'node_modules/vitest/vitest.mjs'),
  'run', '--config', 'react-ssr.vitest.mjs',
], { cwd: consumerRoot, env: { UIFN_PHASE14_INSTALL_MODE: 'package', UIFN_PHASE14_TRACE_OUT: react18SsrTraceFile } });
commands.push(react18SsrRun);
requireSuccess(react18SsrRun);
const react18SsrTraces = readTrace(react18SsrTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-18.3-ssr-hydration', framework: 'react', version: installedFrameworkVersion(consumerRoot, 'react'), mode: 'ssr-hydration',
  traceFile: path.basename(react18SsrTraceFile), traceSha256: sha256(react18SsrTraceFile), publicTreeCount: react18SsrTraces.length, command: react18SsrRun.command,
});

const react18RscTraceFile = path.join(outputRoot, 'compat-react-18-rsc-import-package.json');
const react18RscRun = run(process.execPath, [
  path.join(repoRoot, 'scripts/run-uifn-phase-14-react-rsc-cell.mjs'),
  '--cell', 'react-18.3-rsc-import',
  '--consumer', consumerRoot,
  '--vectors', path.join(consumerRoot, 'vectors.json'),
  '--output', react18RscTraceFile,
]);
commands.push(react18RscRun);
requireSuccess(react18RscRun);
const react18RscTraces = readTrace(react18RscTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-18.3-rsc-import',
  framework: 'react',
  version: installedFrameworkVersion(consumerRoot, 'react'),
  mode: 'rsc-import',
  traceFile: path.basename(react18RscTraceFile),
  traceSha256: sha256(react18RscTraceFile),
  publicTreeCount: react18RscTraces.length,
  command: react18RscRun.command,
});

const react19Root = path.join(workspace, 'react19-consumer');
mkdirSync(react19Root, { recursive: true });
writeFileSync(path.join(react19Root, 'package.json'), `${JSON.stringify({
  name: 'uifn-phase-14-react-19-packed-public-trees',
  private: true,
  type: 'module',
  dependencies: {
    ...Object.fromEntries(packages.filter((entry) => !['@uifn/svelte', '@uifn/solid'].includes(entry.package)).map((entry) => [entry.package, `file:${entry.file}`])),
    '@testing-library/react': '16.3.0',
    'jsdom': '27.0.1',
    'react': '19.2.3',
    'react-dom': '19.2.3',
    'vite': '5.4.21',
    'vitest': '3.2.4',
  },
}, null, 2)}\n`);
for (const file of ['react.test.tsx', 'react.vitest.mjs', 'react-ssr.test.tsx', 'react-ssr.vitest.mjs', 'Phase14ReactPublicTree.ts', 'trace.mjs', 'vectors.json']) {
  copyFileSync(path.join(consumerRoot, file), path.join(react19Root, file));
}
const react19Install = run(npmPath, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
  cwd: react19Root,
  env: { NPM_CONFIG_CACHE: npmCache },
});
commands.push(react19Install);
requireSuccess(react19Install);
const react19TraceFile = path.join(outputRoot, 'compat-react-19-package.json');
const react19Run = run(process.execPath, [
  path.join(react19Root, 'node_modules/vitest/vitest.mjs'),
  'run', '--config', 'react.vitest.mjs',
], {
  cwd: react19Root,
  env: {
    UIFN_PHASE14_INSTALL_MODE: 'package',
    UIFN_PHASE14_TRACE_OUT: react19TraceFile,
  },
});
commands.push(react19Run);
requireSuccess(react19Run);
const react19Traces = readTrace(react19TraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-19-client',
  framework: 'react',
  version: installedFrameworkVersion(react19Root, 'react'),
  mode: 'client',
  traceFile: path.basename(react19TraceFile),
  traceSha256: sha256(react19TraceFile),
  publicTreeCount: react19Traces.length,
  command: react19Run.command,
});
const react19StrictTraceFile = path.join(outputRoot, 'compat-react-19-strictmode-package.json');
const react19StrictRun = run(process.execPath, [
  path.join(react19Root, 'node_modules/vitest/vitest.mjs'),
  'run', '--config', 'react.vitest.mjs',
], {
  cwd: react19Root,
  env: {
    UIFN_PHASE14_INSTALL_MODE: 'package',
    UIFN_PHASE14_REACT_STRICT: '1',
    UIFN_PHASE14_TRACE_OUT: react19StrictTraceFile,
  },
});
commands.push(react19StrictRun);
requireSuccess(react19StrictRun);
const react19StrictTraces = readTrace(react19StrictTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-19-strictmode',
  framework: 'react',
  version: installedFrameworkVersion(react19Root, 'react'),
  mode: 'strictmode',
  traceFile: path.basename(react19StrictTraceFile),
  traceSha256: sha256(react19StrictTraceFile),
  publicTreeCount: react19StrictTraces.length,
  command: react19StrictRun.command,
});
const react19SsrTraceFile = path.join(outputRoot, 'compat-react-19-ssr-hydration-package.json');
const react19SsrRun = run(process.execPath, [
  path.join(react19Root, 'node_modules/vitest/vitest.mjs'),
  'run', '--config', 'react-ssr.vitest.mjs',
], { cwd: react19Root, env: { UIFN_PHASE14_INSTALL_MODE: 'package', UIFN_PHASE14_TRACE_OUT: react19SsrTraceFile } });
commands.push(react19SsrRun);
requireSuccess(react19SsrRun);
const react19SsrTraces = readTrace(react19SsrTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-19-ssr-hydration', framework: 'react', version: installedFrameworkVersion(react19Root, 'react'), mode: 'ssr-hydration',
  traceFile: path.basename(react19SsrTraceFile), traceSha256: sha256(react19SsrTraceFile), publicTreeCount: react19SsrTraces.length, command: react19SsrRun.command,
});

const react19RscTraceFile = path.join(outputRoot, 'compat-react-19-rsc-import-package.json');
const react19RscRun = run(process.execPath, [
  path.join(repoRoot, 'scripts/run-uifn-phase-14-react-rsc-cell.mjs'),
  '--cell', 'react-19-rsc-import',
  '--consumer', react19Root,
  '--vectors', path.join(react19Root, 'vectors.json'),
  '--output', react19RscTraceFile,
]);
commands.push(react19RscRun);
requireSuccess(react19RscRun);
const react19RscTraces = readTrace(react19RscTraceFile, 'react', 'package');
frameworkCompatibilityRuns.push({
  cellId: 'react-19-rsc-import',
  framework: 'react',
  version: installedFrameworkVersion(react19Root, 'react'),
  mode: 'rsc-import',
  traceFile: path.basename(react19RscTraceFile),
  traceSha256: sha256(react19RscTraceFile),
  publicTreeCount: react19RscTraces.length,
  command: react19RscRun.command,
});

writeFileSync(path.join(consumerRoot, 'node-smoke.mjs'), `
for (const name of ['document', 'window']) Object.defineProperty(globalThis, name, { configurable: true, get() { throw new Error(name + ' read during server import'); } });
const packages = await Promise.all(['@uifn/core', '@uifn/dom', '@uifn/adapter-kit'].map((name) => import(name)));
if (packages.some((entry) => Object.keys(entry).length === 0)) throw new Error('Empty packed package import.');
console.log(JSON.stringify({ ok: true, node: process.version, packages: ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit'] }));
`);
const nodeMatrix = [20, 22, 24].map((major) => {
  let check;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    check = run(npmPath, [
      'exec', '--yes', `--package=node@${major}`, '--',
      'node', 'node-smoke.mjs',
    ], { cwd: consumerRoot, env: { NPM_CONFIG_CACHE: npmCache } });
    commands.push({ ...check, command: `${check.command} (attempt ${attempt})` });
    if (check.ok) break;
  }
  requireSuccess(check);
  const payload = JSON.parse(check.stdout.trim().split('\n').at(-1));
  if (payload.ok !== true || !payload.node.startsWith(`v${major}.`)) throw new Error(`Node ${major} packed smoke reported invalid metadata.`);
  return { major, version: payload.node, ok: true, packages: payload.packages };
});

function gitOutput(args, encoding = 'utf8') {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${String(result.stderr)}`);
  return result.stdout;
}

const sourceCommit = String(gitOutput(['rev-parse', 'HEAD'])).trim();
const sourceStatus = String(gitOutput(['status', '--porcelain=v1', '--untracked-files=all']));
const sourceArchive = gitOutput(['archive', '--format=tar', 'HEAD'], null);
const sourceDiff = gitOutput(['diff', '--binary', 'HEAD'], null);
const sourceSnapshotSha256 = createHash('sha256')
  .update(sourceCommit)
  .update(sourceArchive)
  .update(sourceDiff)
  .digest('hex');

mkdirSync(outputConsumerKitRoot, { recursive: true });
const consumerKitFiles = [
  'vectors.json', 'trace.mjs', 'react.test.tsx', 'react.vitest.mjs',
  'react-ssr.test.tsx', 'react-ssr.vitest.mjs', 'Phase14ReactPublicTree.ts',
  'svelte.test.ts', 'svelte.vitest.mjs', 'Phase14PublicTreeHarness.svelte',
  'solid.test.tsx', 'solid.vitest.mjs', 'Phase14SolidPublicTree.tsx', 'node-smoke.mjs',
  'index.html', 'browser-main.ts', 'browser-runtime.ts', 'browser-profile.ts',
  'browser-react.ts', 'browser-svelte.ts', 'browser-solid.tsx', 'browser-vite.config.mjs',
];
for (const file of consumerKitFiles) copyFileSync(path.join(consumerRoot, file), path.join(outputConsumerKitRoot, file));
const frozenDependencies = Object.fromEntries(frozenPackages.map((entry) => [entry.package, `file:../tarballs/${entry.filename}`]));
Object.assign(frozenDependencies, {
  '@sveltejs/vite-plugin-svelte': '4.0.4',
  '@testing-library/react': '15.0.7',
  '@testing-library/svelte': '5.3.1',
  'jsdom': '27.0.1',
  'playwright': '1.57.0',
  'react': '18.3.1',
  'react-dom': '18.3.1',
  'solid-js': '1.9.13',
  'svelte': '5.46.4',
  'vite': '5.4.21',
  'vite-plugin-solid': '2.11.12',
  'vitest': '3.2.4',
});
writeFileSync(path.join(outputConsumerKitRoot, 'package.json'), `${JSON.stringify({
  name: 'uifn-phase-14-frozen-consumer-kit',
  private: true,
  type: 'module',
  dependencies: frozenDependencies,
}, null, 2)}\n`);
const frozenConsumerKitFiles = ['package.json', ...consumerKitFiles]
  .sort()
  .map((file) => ({ file, sha256: sha256(path.join(outputConsumerKitRoot, file)) }));

const result = {
  ok: true,
  generatedAt: new Date().toISOString(),
  command: 'run-uifn-phase-14-traces',
  requirements: ['PARITY-001', 'COMPAT-001'],
  vectors: ['TV-PARITY-001-P'],
  outputRoot,
  temporaryConsumer: consumerRoot,
  counts: {
    primitives: expectedPrimitiveCount,
    frameworks: 3,
    installModes: 2,
    traces: sourceTraces.length + packageTraces.length,
  },
  source: {
    commit: sourceCommit,
    dirty: sourceStatus.trim().length > 0,
    snapshotSha256: sourceSnapshotSha256,
  },
  packages: frozenPackages,
  artifactSetSha256: phase14ArtifactSetHash(frozenPackages),
  consumerKit: {
    version: 2,
    files: frozenConsumerKitFiles,
    sha256: createHash('sha256').update(JSON.stringify(frozenConsumerKitFiles)).digest('hex'),
  },
  compatibility: {
    react: ['18.3.1', '19.2.3'],
    svelte: ['5.46.4'],
    solid: ['1.9.13'],
    node: nodeMatrix,
    frameworkRuns: frameworkCompatibilityRuns,
  },
  commands: commands.map((entry) => ({
    command: entry.command,
    cwd: entry.cwd,
    ok: entry.ok,
    status: entry.status,
    stdout: entry.stdout.split('\n').slice(-25).join('\n').trim(),
    stderr: entry.stderr.split('\n').slice(-25).join('\n').trim(),
  })),
};
writeFileSync(path.join(outputRoot, 'trace-run.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
