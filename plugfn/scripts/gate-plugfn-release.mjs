#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RELEASE_GATE_COMMAND = 'npm run gate:plugfn-release';

const docsInventory = [
  'plugfn/README.md',
  'plugfn/SPEC.md',
  'plugfn/.conduct/STATUS.md',
  'plugfn/docs/getting-started.md',
  'plugfn/docs/provider-readiness-matrix.md',
  'plugfn/docs/client-sdk-boundary.md',
  'plugfn/docs/operations/release-gates.md',
  'plugfn/python/README.md',
  'plugfn/python/SUMMARY.md',
];

const absolutePathPattern =
  /(^|[\s("'`])(?:\/Users\/[^\s"'`)\]]+|\/home\/[^\s"'`)\]]+|[A-Za-z]:\\Users\\[^\s"'`)\]]+)/m;
const staleGatePattern = /\bfuture repo-root\b|planned for a later implementation phase|future release gating/i;
const legacyPackagePatterns = [/@superfunctions\/plugfn\b/, /@superfunctions\/plugfn-cli\b/];
const requiredCoreProviders = ['github', 'linear', 'clickup', 'gmail', 'notion'];

const steps = [
  {
    name: 'typescriptClean',
    command: 'npm',
    args: ['--prefix', 'plugfn/core', 'run', 'clean'],
  },
  {
    name: 'typescriptBuild',
    command: 'npm',
    args: ['--prefix', 'plugfn/core', 'run', 'build'],
  },
  {
    name: 'typescriptTypecheck',
    command: 'npm',
    args: ['--prefix', 'plugfn/core', 'run', 'type-check'],
  },
  {
    name: 'typescriptTests',
    command: 'npm',
    args: ['--prefix', 'plugfn/core', 'test', '--', '--run'],
  },
  {
    name: 'typescriptE2E',
    command: 'npm',
    args: [
      '--prefix',
      'plugfn/core',
      'test',
      '--',
      '--run',
      'tests/e2e/oauth-callback.test.ts',
      'tests/e2e/webhook-verification.test.ts',
    ],
  },
  {
    name: 'clientBuild',
    command: 'npm',
    args: ['--prefix', 'plugfn/client', 'run', 'build'],
  },
  {
    name: 'clientTypecheck',
    command: 'npm',
    args: ['--prefix', 'plugfn/client', 'run', 'typecheck'],
  },
  {
    name: 'clientTests',
    command: 'npm',
    args: ['--prefix', 'plugfn/client', 'test', '--', '--run'],
  },
  {
    name: 'providersClean',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'run', 'clean'],
  },
  {
    name: 'providersBuild',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'run', 'build'],
  },
  {
    name: 'providersTypecheck',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'run', 'typecheck'],
  },
  {
    name: 'providersTests',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'test', '--', '--run'],
  },
  {
    name: 'providerGateGithub',
    command: 'node',
    args: ['plugfn/scripts/gate-plugfn-provider.mjs', 'github'],
  },
  {
    name: 'providerGateLinear',
    command: 'node',
    args: ['plugfn/scripts/gate-plugfn-provider.mjs', 'linear'],
  },
  {
    name: 'providerGateGmail',
    command: 'node',
    args: ['plugfn/scripts/gate-plugfn-provider.mjs', 'gmail'],
  },
  {
    name: 'providerGateNotion',
    command: 'node',
    args: ['plugfn/scripts/gate-plugfn-provider.mjs', 'notion'],
  },
  {
    name: 'cliBuild',
    command: 'npm',
    args: ['--prefix', 'plugfn/cli', 'run', 'build'],
  },
  {
    name: 'cliTypecheck',
    command: 'npm',
    args: ['--prefix', 'plugfn/cli', 'run', 'type-check'],
  },
  {
    name: 'cliTests',
    command: 'npm',
    args: ['--prefix', 'plugfn/cli', 'test', '--', '--run'],
  },
  {
    name: 'pythonTests',
    command: 'python3',
    args: ['-m', 'pytest', '-q', 'plugfn/python/tests'],
  },
];

function runStep(step) {
  const result = spawnSync(step.command, step.args, {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8',
    shell: false,
  });

  return {
    name: step.name,
    command: [step.command, ...step.args].join(' '),
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
  };
}

function verifyDocsInventory() {
  const missingFiles = docsInventory.filter((file) => !existsSync(resolve(process.cwd(), file)));
  const contents = new Map(
    docsInventory
      .filter((file) => existsSync(resolve(process.cwd(), file)))
      .map((file) => [file, readFileSync(resolve(process.cwd(), file), 'utf8')])
  );

  const absolutePathMatches = [];
  const legacyPackageMatches = [];
  const staleGateMatches = [];

  for (const [file, content] of contents.entries()) {
    if (absolutePathPattern.test(content)) {
      absolutePathMatches.push(file);
    }

    if (legacyPackagePatterns.some((pattern) => pattern.test(content))) {
      legacyPackageMatches.push(file);
    }

    if (staleGatePattern.test(content)) {
      staleGateMatches.push(file);
    }
  }

  const statusContent = contents.get('plugfn/.conduct/STATUS.md') ?? '';
  const releaseGuideContent = contents.get('plugfn/docs/operations/release-gates.md') ?? '';
  const matrixContent = contents.get('plugfn/docs/provider-readiness-matrix.md') ?? '';

  const releaseCommandPresent =
    statusContent.includes(RELEASE_GATE_COMMAND) && releaseGuideContent.includes(RELEASE_GATE_COMMAND);
  const portableReleaseCommands = !/^\s*cd\s+[/~]/m.test(releaseGuideContent);
  const coreProvidersPresent = requiredCoreProviders.every((provider) => matrixContent.includes(provider));

  const ok =
    missingFiles.length === 0 &&
    absolutePathMatches.length === 0 &&
    legacyPackageMatches.length === 0 &&
    staleGateMatches.length === 0 &&
    releaseCommandPresent &&
    portableReleaseCommands &&
    coreProvidersPresent;

  return {
    ok,
    checkedFiles: docsInventory,
    missingFiles,
    absolutePathMatches,
    legacyPackageMatches,
    staleGateMatches,
    releaseCommandPresent,
    portableReleaseCommands,
    coreProvidersPresent,
  };
}

const stepResults = steps.map(runStep);
const docsResult = verifyDocsInventory();

const payload = {
  ok: stepResults.every((step) => step.ok) && docsResult.ok,
  releaseGate: RELEASE_GATE_COMMAND,
  steps: stepResults,
  docsInventory: docsResult,
  productionReadyCondition:
    'Only commits with a green npm run gate:plugfn-release and production rows in plugfn/docs/provider-readiness-matrix.md may be described as production-ready.',
};

if (payload.ok) {
  console.log(JSON.stringify(payload));
  process.exit(0);
}

console.error(JSON.stringify(payload));
process.exit(1);
