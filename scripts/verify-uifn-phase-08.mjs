#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const browserOutput = process.env.UIFN_PHASE08_BROWSER_OUTPUT ?? path.resolve('uifn/.conduct/evidence/phase-08/browser-latest');
const commands = [
  ['npm',['--workspace','@uifn/core','run','typecheck']], ['npm',['--workspace','@uifn/core','run','test']], ['npm',['--workspace','@uifn/core','run','build']],
  ['npm',['--workspace','@uifn/dom','run','typecheck']], ['npm',['--workspace','@uifn/dom','run','test']], ['npm',['--workspace','@uifn/dom','run','build']],
  ['npm',['--workspace','@uifn/adapter-kit','run','typecheck']], ['npm',['--workspace','@uifn/adapter-kit','run','test']], ['npm',['--workspace','@uifn/adapter-kit','run','build']],
  [process.execPath,['--test','scripts/verify-uifn-phase-08-contract.test.mjs']], [process.execPath,['scripts/verify-uifn-phase-08-contract.mjs','--require-dist']],
  [process.execPath,['scripts/generate-uifn-phase-08.mjs','--check']], [process.execPath,['scripts/verify-uifn-navigation-pack.mjs']],
  ['npm',['--workspace','@uifn/dom','run','test:browser'],{ UIFN_PHASE08_BROWSER_OUTPUT: browserOutput }],
  [process.execPath,['scripts/verify-uifn-dom-platform.mjs','--require-dist']], [process.execPath,['scripts/verify-uifn-controller-contract.mjs','--require-dist']],
  [process.execPath,['scripts/verify-uifn-runtime-architecture.mjs','--require-dist']], [process.execPath,['scripts/verify-uifn-core-node-matrix.mjs']],
  ['npm',['--workspace','@uifn/react','run','typecheck']], ['npm',['--workspace','@uifn/svelte','run','typecheck']], ['npm',['--workspace','@uifn/solid','run','typecheck']],
  [process.execPath,['scripts/generate-uifn-catalog.mjs','--check']], [process.execPath,['scripts/verify-uifn-stable.mjs']],
];
const checks = commands.map(([command,args,extraEnv]) => {
  const result = spawnSync(command,args,{ cwd: process.cwd(), env: { ...process.env, ...(extraEnv ?? {}) }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { command: [command,...args].join(' '), ok: result.status === 0, status: result.status, stdout: result.stdout.split('\n').slice(-100).join('\n').trim(), stderr: result.stderr.split('\n').slice(-100).join('\n').trim() };
});
const result = { ok: checks.every((check) => check.ok), command: 'verify:uifn-phase-08', requirement: 'PRIM-003', vectors: ['TV-PRIM-003-P','TV-PRIM-003-N','TV-DOM-002-P/N','TV-DOM-003-P/N','TV-DOM-005-P/N','TV-DOM-006-P/N'], browserOutput, checks };
console[result.ok ? 'log' : 'error'](JSON.stringify(result,null,2)); process.exit(result.ok ? 0 : 1);
