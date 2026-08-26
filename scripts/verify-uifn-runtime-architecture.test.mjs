import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyRuntimeMutations,
  inspectRuntimeArchitecture,
  loadRuntimeArchitectureInput,
} from './verify-uifn-runtime-architecture.mjs';

test('TV-ARCH-001-P: one private runtime and no public declaration path', () => {
  const input = loadRuntimeArchitectureInput();
  assert.deepEqual(inspectRuntimeArchitecture(input), []);
});

test('TV-ARCH-001-N: local runtime and private export fail with exact codes', () => {
  const input = loadRuntimeArchitectureInput();
  input.sourceFiles['uifn/core/src/primitives/seeded-local-runtime.ts'] = `
    let state = { open: false };
    const listeners = new Set();
    const start = () => setTimeout(() => { state.open = true; }, 1);
  `;
  input.packageJson = {
    ...input.packageJson,
    exports: {
      ...input.packageJson.exports,
      './internal/runtime': './dist/internal/runtime/service.js',
    },
  };
  const codes = new Set(inspectRuntimeArchitecture(input).map((entry) => entry.code));
  assert.deepEqual(codes, new Set(['UIFN_MULTIPLE_BEHAVIOR_RUNTIME', 'UIFN_PRIVATE_RUNTIME_EXPORTED']));
});

test('TV-CORE-001-N through TV-CORE-004-N: contract mutations retain exact stable classifications', () => {
  assert.deepEqual(classifyRuntimeMutations({
    recursiveDispatch: true,
    suppressSameStatePublication: true,
    snapshotContainsRef: true,
    sharedScopeCounter: true,
    effectWithoutCleanup: true,
    staleEffectCanMutate: true,
    unknownChangeMeta: true,
    rawErrorEscapes: true,
    traceContainsSecret: true,
  }), [
    'UIFN_EVENT_ORDER_DIVERGED',
    'UIFN_SNAPSHOT_CHANGE_NOT_PUBLISHED',
    'UIFN_SNAPSHOT_NON_SERIALIZABLE',
    'UIFN_SCOPE_ID_COLLISION',
    'UIFN_EFFECT_CLEANUP_MISSING',
    'UIFN_STALE_EFFECT_MUTATION',
    'UIFN_CHANGE_META_INVALID',
    'UIFN_UNSTABLE_ERROR',
    'UIFN_TRACE_SECRET',
  ]);
});
