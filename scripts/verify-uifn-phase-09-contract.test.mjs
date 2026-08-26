import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhase09Mutations, verifyPhase09Contract } from './verify-uifn-phase-09-contract.mjs';

test('TV-PRIM-004-P and TV-PRIM-005-P accept the seventeen canonical controllers and three adapter labels', async () => {
  const result = await verifyPhase09Contract();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.primitiveCount, 17);
  assert.deepEqual(result.frameworks, ['react','svelte','solid']);
});

test('TV-PRIM-004-N classifies controlled mutation and object serialization exactly', () => {
  assert.deepEqual(classifyPhase09Mutations({ controlledSelectMutates: true }), ['UIFN_CONTROLLED_STATE_DIVERGED']);
  assert.deepEqual(classifyPhase09Mutations({ implicitObjectStringification: true }), ['UIFN_FORM_VALUE_SERIALIZATION']);
});

test('TV-PRIM-005-N classifies early IME commit and secret evidence exactly', () => {
  assert.deepEqual(classifyPhase09Mutations({ filterDuringComposition: true }), ['UIFN_IME_COMMIT_EARLY']);
  assert.deepEqual(classifyPhase09Mutations({ passwordInTrace: true }), ['UIFN_TRACE_SECRET']);
});

test('capability and lifecycle violations fail closed', () => {
  assert.deepEqual(classifyPhase09Mutations({ ambientClipboard: true }), ['UIFN_INPUT_CAPABILITY_UNAVAILABLE']);
  assert.deepEqual(classifyPhase09Mutations({ resourceLeak: true }), ['UIFN_INPUT_RESOURCE_LEAK']);
});
