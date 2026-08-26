import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPhase11Mutations } from './verify-uifn-phase-11-contract.mjs';

test('Phase 11 mutation classifier emits exact stable codes', () => {
  assert.deepEqual(classifyPhase11Mutations({ localSelectionState: true }), ['UIFN_FRAMEWORK_BEHAVIOR_FORK']);
  assert.deepEqual(classifyPhase11Mutations({ nonForwardedPartRef: true }), ['UIFN_PART_REF_LOST']);
  assert.deepEqual(classifyPhase11Mutations({ localFocusBehavior: true, nonForwardedPartRef: true }), ['UIFN_FRAMEWORK_BEHAVIOR_FORK', 'UIFN_PART_REF_LOST']);
  assert.deepEqual(classifyPhase11Mutations({}), []);
});
