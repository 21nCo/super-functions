#!/usr/bin/env node

import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const core = await import(pathToFileURL(resolve('uifn/core/dist/index.mjs')).href);
const iterations = 50_000;
const toggle = core.createToggleController();
for (let index = 0; index < 1_000; index += 1) toggle.actions.toggle();
const startedAt = performance.now();
for (let index = 0; index < iterations; index += 1) {
  toggle.actions.toggle();
}
const elapsedMs = performance.now() - startedAt;
toggle.destroy();

const result = {
  ok: Number.isFinite(elapsedMs) && elapsedMs > 0,
  command: 'benchmark:uifn-core-runtime',
  node: process.version,
  iterations,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  nanosecondsPerDispatch: Math.round((elapsedMs * 1_000_000) / iterations),
  note: 'Informational PHASE_03 baseline; release budgets are owned by PERF-001/PHASE_17.',
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
