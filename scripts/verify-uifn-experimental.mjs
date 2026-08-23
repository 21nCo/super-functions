#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = process.cwd();

function lanePolicyCheck() {
  const lanes = JSON.parse(readFileSync(path.join(repoRoot, 'uifn', 'release-lanes.json'), 'utf8'));
  const failures = [];
  for (const entry of lanes.experimental ?? []) {
    const packagePath = entry.package === '@uifn/patterns' ? 'patterns' : entry.package === '@uifn/sf' ? 'sf' : undefined;
    if (!packagePath) {
      failures.push({ code: 'UIFN_EXPERIMENTAL_LANE_PACKAGE_UNKNOWN', package: entry.package });
      continue;
    }
    const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'uifn', packagePath, 'package.json'), 'utf8'));
    if (manifest.version !== entry.version || manifest.publishConfig?.tag !== entry.distTag || entry.stableBlocking !== false) {
      failures.push({ code: 'UIFN_EXPERIMENTAL_LANE_POLICY_INVALID', package: entry.package });
    }
    if (!existsSync(path.join(repoRoot, 'uifn', packagePath, 'CHANGELOG.md'))) {
      failures.push({ code: 'UIFN_EXPERIMENTAL_CHANGELOG_MISSING', package: entry.package });
    }
  }
  return {
    command: 'experimental-release-lane-policy',
    ok: failures.length === 0,
    status: failures.length === 0 ? 0 : 1,
    stdout: JSON.stringify({ lanes: lanes.experimental?.map((entry) => entry.package) ?? [] }),
    stderr: JSON.stringify(failures),
  };
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repoRoot, env: process.env, encoding: 'utf8' });
  return {
    command: [command, ...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-24).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-24).join('\n').trim(),
  };
}

export function runExperimentalVerification(options = {}) {
  const fixture = options.fixture ?? process.env.UIFN_EXPERIMENTAL_FAILURE_FIXTURE;
  const checks = options.skipCommands ? [] : [
    lanePolicyCheck(),
    run(process.execPath, ['scripts/verify-uifn-package-graph.mjs']),
    run(process.execPath, ['scripts/verify-uifn-patterns.mjs']),
    run(process.execPath, ['scripts/verify-uifn-sf.mjs']),
  ];
  if (fixture) checks.push({ command: `experimental-fixture:${fixture}`, ok: false, status: 1, stdout: '', stderr: 'Synthetic experimental lane failure.' });
  return {
    ok: checks.every((check) => check.ok),
    command: 'verify:uifn-experimental',
    stableBlocking: false,
    packages: ['@uifn/patterns', '@uifn/sf'],
    checks,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = runExperimentalVerification();
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
