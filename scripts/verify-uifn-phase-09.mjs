#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const browserOutput = process.env.UIFN_PHASE09_BROWSER_OUTPUT
  ?? path.resolve('uifn/.conduct/evidence/phase-09/browser-latest');
const commands = [
  ['npm',['--workspace','@uifn/core','run','typecheck']],
  ['npm',['--workspace','@uifn/core','run','test']],
  ['npm',['--workspace','@uifn/core','run','build']],
  ['npm',['--workspace','@uifn/dom','run','typecheck']],
  ['npm',['--workspace','@uifn/dom','run','test']],
  ['npm',['--workspace','@uifn/dom','run','build']],
  ['npm',['--workspace','@uifn/adapter-kit','run','typecheck']],
  ['npm',['--workspace','@uifn/adapter-kit','run','test']],
  ['npm',['--workspace','@uifn/adapter-kit','run','build']],
  [process.execPath,['--test','scripts/verify-uifn-phase-09-contract.test.mjs']],
  [process.execPath,['scripts/verify-uifn-phase-09-contract.mjs','--require-dist']],
  [process.execPath,['scripts/generate-uifn-phase-09.mjs','--check']],
  ['npm',['--workspace','@uifn/dom','run','test:browser'],{ UIFN_PHASE09_BROWSER_OUTPUT: browserOutput }],
  [process.execPath,['scripts/verify-uifn-dom-platform.mjs','--require-dist']],
  [process.execPath,['scripts/verify-uifn-controller-contract.mjs','--require-dist']],
  [process.execPath,['scripts/verify-uifn-runtime-architecture.mjs','--require-dist']],
  [process.execPath,['scripts/verify-uifn-core-node-matrix.mjs']],
  ['npm',['--workspace','@uifn/react','run','typecheck']],
  ['npm',['--workspace','@uifn/svelte','run','typecheck']],
  ['npm',['--workspace','@uifn/solid','run','typecheck']],
  ['npm',['--workspace','@uifn/react','exec','--','vitest','run','src/__tests__/react-core-adapter.test.tsx','src/__tests__/phase-09-input-events.test.tsx']],
  ['npm',['--workspace','@uifn/svelte','exec','--','vitest','run','src/svelte-core-adapter.test.ts','src/phase-09-input-events.test.ts']],
  ['npm',['--workspace','@uifn/solid','exec','--','vitest','run','--config','vitest.config.ts','src/__tests__/phase-13-solid.test.tsx']],
  [process.execPath,['scripts/generate-uifn-catalog.mjs','--check']],
  [process.execPath,['scripts/verify-uifn-pack.mjs']],
  [process.execPath,['scripts/verify-uifn-stable.mjs']],
];

const checks = commands.map(([command,args,extraEnv]) => {
  const result = spawnSync(command,args,{ cwd: process.cwd(), env: { ...process.env, ...(extraEnv ?? {}) }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    command: [command,...args].join(' '),
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout.split('\n').slice(-100).join('\n').trim(),
    stderr: result.stderr.split('\n').slice(-100).join('\n').trim(),
  };
});
const result = {
  ok: checks.every((check) => check.ok),
  command: 'verify:uifn-phase-09',
  requirements: ['PRIM-004','PRIM-005'],
  vectors: ['TV-PRIM-004-P','TV-PRIM-004-N','TV-PRIM-005-P','TV-PRIM-005-N','TV-DOM-007-P/N'],
  primitiveCount: 17,
  inheritedPrimitiveCount: 1,
  frameworks: ['react','svelte','solid'],
  browsers: ['chromium','firefox','webkit','mobile-chromium','mobile-webkit'],
  browserOutput,
  checks,
};
console[result.ok ? 'log' : 'error'](JSON.stringify(result,null,2));
process.exit(result.ok ? 0 : 1);
