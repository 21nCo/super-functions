import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  loadPhase14TraceCorpus,
  runPhase14ParityMutations,
  verifyPhase14Parity,
} from './verify-uifn-phase-14-parity.mjs';

const traceRoot = process.env.UIFN_PHASE14_TRACE_DIR;
const golden = JSON.parse(readFileSync(path.resolve('uifn/.conduct/generated/phase-14/phase-14-semantic-traces.json'), 'utf8'));

test('TV-PARITY-001-P compares every actual source and packed public tree', { skip: !traceRoot }, () => {
  const result = verifyPhase14Parity(path.resolve(traceRoot));
  assert.equal(result.ok, true);
  assert.equal(result.traceCount, 414);
  assert.equal(result.compared, 414);
  assert.equal(result.crossInstallCompared, 207);
});

test('TV-PARITY-001-N reports precise ARIA, callback-order, and focus paths', { skip: !traceRoot }, () => {
  const corpus = loadPhase14TraceCorpus(path.resolve(traceRoot));
  assert.deepEqual(corpus.issues, []);
  const mutations = runPhase14ParityMutations(golden.traces, corpus.traces);
  assert.deepEqual(mutations.map(({ id, expectedPath, caught }) => ({ id, expectedPath, caught })), [
    { id: 'solid-aria-activedescendant', expectedPath: '/parts/0/parts/4/aria/activedescendant', caught: true },
    { id: 'svelte-callback-order', expectedPath: '/callbacks/0/arguments/0', caught: true },
    { id: 'react-focus-result', expectedPath: '/focus/1/part', caught: true },
  ]);
});
