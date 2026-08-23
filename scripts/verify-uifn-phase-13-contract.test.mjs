import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PHASE_13_MUTATION_CODES,
  classifyPhase13Mutations,
  verifyPhase13Contract,
} from './verify-uifn-phase-13-contract.mjs';

test('TV-SOLID-001-P accepts the canonical source contract', () => {
  assert.deepEqual(verifyPhase13Contract(), []);
});

test('TV-SOLID-001-N classifies a generic substitute exactly', () => {
  assert.deepEqual(
    classifyPhase13Mutations({ genericFactory: true }),
    [PHASE_13_MUTATION_CODES.genericFactory],
  );
});

test('TV-SOLID-001-N classifies stale destructured reactivity exactly', () => {
  assert.deepEqual(
    classifyPhase13Mutations({ staleReactiveInput: true }),
    [PHASE_13_MUTATION_CODES.staleReactiveInput],
  );
});

test('TV-SOLID-001-N preserves deterministic multi-mutation ordering', () => {
  assert.deepEqual(
    classifyPhase13Mutations({ genericFactory: true, staleReactiveInput: true }),
    ['UIFN_SOLID_COMPOUND_MISSING', 'UIFN_SOLID_REACTIVITY_STALE'],
  );
});
