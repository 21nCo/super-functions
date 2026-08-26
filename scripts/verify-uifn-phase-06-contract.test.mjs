import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhase06Mutations, verifyPhase06Contract } from './verify-uifn-phase-06-contract.mjs';

test('TV-CAT-002-P and TV-PRIM-001-P accept the canonical source contract', async () => {
  const result = await verifyPhase06Contract();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.primitiveCount, 14);
  assert.equal(result.staticContractCount, 9);
  assert.equal(result.controllerCount, 5);
});

test('TV-CAT-002-N detects shared algorithm forks and collection invariant failures', () => {
  assert.deepEqual(classifyPhase06Mutations({ duplicateTypeahead: true }), ['UIFN_SHARED_ALGORITHM_FORK']);
  assert.deepEqual(classifyPhase06Mutations({ disabledItemFocusedAfterReorder: true }), ['UIFN_COLLECTION_INVARIANT']);
  assert.deepEqual(classifyPhase06Mutations({ duplicateKeyAccepted: true, localRangeAlgorithm: true }), ['UIFN_SHARED_ALGORITHM_FORK', 'UIFN_COLLECTION_INVARIANT']);
});

test('TV-PRIM-001-N detects lost native semantics and static runtime costs', () => {
  assert.deepEqual(classifyPhase06Mutations({ buttonUsesDiv: true }), ['UIFN_NATIVE_SEMANTIC_LOST']);
  assert.deepEqual(classifyPhase06Mutations({ staticSubscription: true }), ['UIFN_STATIC_RUNTIME_COST']);
  assert.deepEqual(classifyPhase06Mutations({ nativeFormRoleReplacement: true, staticEffect: true }), ['UIFN_NATIVE_SEMANTIC_LOST', 'UIFN_STATIC_RUNTIME_COST']);
});
