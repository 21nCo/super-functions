#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const args = process.argv.slice(2);
const frameworkIndex = args.indexOf('--framework');
const framework = frameworkIndex >= 0 ? args[frameworkIndex + 1] : undefined;
const failures = [];
const contracts = {
  react: {
    packageName: '@uifn/react',
    packagePath: 'uifn/react/package.json',
    sourcePath: 'uifn/react/src/conformance/react-conformance.ts',
    testPath: 'src/__tests__/react-adapter-matrix.test.tsx',
  },
  svelte: {
    packageName: '@uifn/svelte',
    packagePath: 'uifn/svelte/package.json',
    sourcePath: 'uifn/svelte/lib/conformance/svelte-conformance.ts',
    testPath: 'tests/phase-12-svelte.test.ts',
  },
  solid: {
    packageName: '@uifn/solid',
    packagePath: 'uifn/solid/package.json',
    sourcePath: 'uifn/solid/src/conformance/solid-conformance.ts',
    testPath: 'src/__tests__/phase-13-solid.test.tsx',
  },
};

if (!framework) {
  failures.push({ code: 'UIFN_ADAPTER_FRAMEWORK_MISSING' });
} else if (!(framework in contracts)) {
  failures.push({ code: 'UIFN_ADAPTER_FRAMEWORK_UNSUPPORTED', framework });
}

const executedTestCommands = [];
if (framework in contracts) {
  const contract = contracts[framework];
  for (const pathname of [contract.packagePath, contract.sourcePath]) {
    if (!existsSync(path.join(repoRoot, pathname))) {
      failures.push({ code: 'UIFN_ADAPTER_FILE_MISSING', framework, path: pathname });
    }
  }

  if (existsSync(path.join(repoRoot, contract.packagePath))) {
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, contract.packagePath), 'utf8'));
    for (const dependency of ['@uifn/core', '@uifn/dom', '@uifn/adapter-kit']) {
      if (!manifest.dependencies?.[dependency]) {
        failures.push({ code: 'UIFN_ADAPTER_DEPENDENCY_MISSING', framework, dependency });
      }
    }
  }

  const command = framework === 'solid'
    ? ['npm', '--workspace', contract.packageName, 'exec', '--', 'vitest', 'run', '--config', 'vitest.config.ts', contract.testPath]
    : ['npm', '--workspace', contract.packageName, 'run', 'test', '--', contract.testPath];
  const result = spawnSync(command[0], command.slice(1), { cwd: repoRoot, env: process.env, encoding: 'utf8' });
  executedTestCommands.push({ command: command.join(' '), passed: result.status === 0, status: result.status });
  if (result.status !== 0) {
    failures.push({
      code: 'UIFN_ADAPTER_CONFORMANCE_TEST_FAILED',
      framework,
      command: command.join(' '),
      stdoutTail: result.stdout.split('\n').slice(-16).join('\n').trim(),
      stderrTail: result.stderr.split('\n').slice(-16).join('\n').trim(),
    });
  }
}

const output = { ok: failures.length === 0, command: 'verify:uifn-adapter', framework, executedTestCommands, failures };
console[failures.length === 0 ? 'log' : 'error'](JSON.stringify(output, null, 2));
if (failures.length > 0) process.exit(1);
