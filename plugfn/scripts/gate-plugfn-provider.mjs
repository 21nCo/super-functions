#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const provider = process.argv[2];
const supportedProviders = new Set(['github', 'linear', 'gmail', 'notion']);
const providerTestPatterns = {
  github: ['tests/github'],
  linear: ['tests/linear'],
  gmail: ['tests/gmail.sync.test.ts', 'tests/gmail.watch.test.ts'],
  notion: ['tests/notion.test.ts'],
};

if (!provider || !supportedProviders.has(provider)) {
  console.error(
    JSON.stringify({
      ok: false,
      error: 'usage: node plugfn/scripts/gate-plugfn-provider.mjs <github|linear|gmail|notion>',
    })
  );
  process.exit(1);
}

const steps = [
  {
    name: 'providersBuild',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'run', 'build'],
  },
  {
    name: 'providerTests',
    command: 'npm',
    args: ['--prefix', 'plugfn/providers', 'test', '--', '--run', ...providerTestPatterns[provider]],
  },
];

const results = [];
for (const step of steps) {
  const startedAt = Date.now();
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: false,
  });
  results.push({
    name: step.name,
    ok: result.status === 0,
    durationMs: Date.now() - startedAt,
  });

  if (result.status !== 0) {
    console.error(JSON.stringify({ ok: false, provider, results }, null, 2));
    process.exit(result.status ?? 1);
  }
}

console.log(JSON.stringify({ ok: true, provider, results }, null, 2));
