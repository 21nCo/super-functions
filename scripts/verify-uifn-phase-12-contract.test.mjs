import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_12_MUTATION_CODES,
  classifyPhase12Mutations,
  verifyPhase12Contract,
} from './verify-uifn-phase-12-contract.mjs';

test('TV-SVELTE-001-P accepts the canonical source contract', () => {
  assert.deepEqual(verifyPhase12Contract(), []);
});

test('TV-SVELTE-001-N classifies raw source exports exactly', () => {
  assert.deepEqual(
    classifyPhase12Mutations({ rawSourceExport: true }),
    [PHASE_12_MUTATION_CODES.rawSourceExport],
  );
});

test('TV-SVELTE-001-N classifies controller recreation exactly', () => {
  assert.deepEqual(
    classifyPhase12Mutations({ recreateControllerOnUpdate: true }),
    [PHASE_12_MUTATION_CODES.recreateControllerOnUpdate],
  );
});

test('TV-SVELTE-001-N preserves deterministic multi-mutation ordering', () => {
  assert.deepEqual(
    classifyPhase12Mutations({ rawSourceExport: true, recreateControllerOnUpdate: true }),
    ['UIFN_PACKAGE_RAW_SOURCE_EXPORT', 'UIFN_SERVICE_RECREATED_ON_UPDATE'],
  );
});
