import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  inspectObservedAssertion,
  phase18MutationResults,
  phase18SemanticMutationResults,
  validateFailureArtifact,
  validateLedger,
} from './uifn-phase-18-contract.mjs';

const catalog = JSON.parse(readFileSync(new URL('../uifn/catalog/generated/catalog.json', import.meta.url), 'utf8'));
const ledger = JSON.parse(readFileSync(new URL('../uifn/.conduct/generated/phase-18/normative-ledger.json', import.meta.url), 'utf8'));
const traces = [];
for (const installMode of ['package', 'source']) {
  for (const framework of ['react', 'svelte', 'solid']) {
    traces.push(...JSON.parse(readFileSync(new URL(`../uifn/.conduct/evidence/phase-14/20260724T110120Z-PHASE-18-a11y-root-semantics/${installMode}-${framework}.json`, import.meta.url), 'utf8')));
  }
}

test('reviewed ledger covers all primitives, modes, and rule mappings', () => {
  assert.deepEqual(validateLedger(ledger, catalog, { now: new Date('2026-07-24T12:00:00Z') }), []);
});

test('required negative mutations are killed with stable codes', () => {
  const results = phase18MutationResults(ledger, catalog);
  assert.deepEqual(results.map(({ expected, observed }) => [expected, observed]), [
    ['UIFN_A11Y_NA_UNJUSTIFIED', 'UIFN_A11Y_NA_UNJUSTIFIED'],
    ['UIFN_A11Y_RULE_MISSING', 'UIFN_A11Y_RULE_MISSING'],
    ['UIFN_A11Y_FOCUS_ESCAPE', 'UIFN_A11Y_FOCUS_ESCAPE'],
    ['UIFN_ASSERTION_NOT_OBSERVED', 'UIFN_ASSERTION_NOT_OBSERVED'],
  ]);
});

test('ARIA, event-order, announcement, cleanup, package/source, and framework mutations are killed', () => {
  const results = phase18SemanticMutationResults(traces);
  assert.deepEqual(results.map(({ expected, observed }) => [expected, observed]), [
    ['UIFN_A11Y_FRAMEWORK_DIVERGENCE', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE'],
    ['UIFN_A11Y_FRAMEWORK_DIVERGENCE', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE'],
    ['UIFN_A11Y_FRAMEWORK_DIVERGENCE', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE'],
    ['UIFN_A11Y_CLEANUP_LEAK', 'UIFN_A11Y_CLEANUP_LEAK'],
    ['UIFN_A11Y_PACKAGE_SOURCE_DRIFT', 'UIFN_A11Y_PACKAGE_SOURCE_DRIFT'],
    ['UIFN_A11Y_FRAMEWORK_DIVERGENCE', 'UIFN_A11Y_FRAMEWORK_DIVERGENCE'],
  ]);
});

test('irrelevant zero-duration assertions cannot auto-pass', () => {
  assert.equal(inspectObservedAssertion({ observed: true, beforeSha256: 'a'.repeat(64), afterSha256: 'b'.repeat(64), durationMs: 0, syntheticAutoPass: true }).code, 'UIFN_ASSERTION_NOT_OBSERVED');
});

test('failure artifacts must be complete, sanitized, and expiring', () => {
  const artifact = {
    code: 'UIFN_A11Y_FOCUS_ESCAPE',
    primitive: 'dialog',
    framework: 'react',
    deliveryMode: 'package',
    browser: 'chromium',
    version: '1',
    sourceHash: 'a'.repeat(64),
    dom: '<div role="dialog"></div>',
    semanticTrace: [],
    eventTrace: [],
    focusPath: ['dialog', 'outside'],
    screenshot: 'screenshot.png',
    capturedAt: '2026-07-24T00:00:00.000Z',
    expiresAt: '2026-07-31T00:00:00.000Z',
  };
  assert.deepEqual(validateFailureArtifact(artifact), []);
  const codes = validateFailureArtifact({ ...artifact, dom: '/Users/example token=x', screenshot: '/tmp/x.png' }).map((failure) => failure.code);
  assert(codes.includes('UIFN_A11Y_FAILURE_ARTIFACT_UNSANITIZED'));
  assert(codes.includes('UIFN_A11Y_FAILURE_ARTIFACT_INCOMPLETE'));
});
