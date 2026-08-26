import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPhase14AdapterMutations,
  verifyPhase14AdapterKit,
} from './verify-uifn-phase-14-adapter.mjs';

test('TV-ADAPT-001-P keeps adapter-kit translation and trace only', () => {
  assert.equal(verifyPhase14AdapterKit().ok, true);
});

test('TV-ADAPT-001-N rejects primitive behavior and lossy callback normalization', () => {
  assert.deepEqual(classifyPhase14AdapterMutations({
    source: `const SelectKeys = { ArrowDown: 'open' }; function createSelectController() {}`,
    normalizeCallbackOrder: true,
  }), [
    'UIFN_ADAPTER_BEHAVIOR_FORK',
    'UIFN_TRACE_NORMALIZATION_LOSSY',
  ]);
});
