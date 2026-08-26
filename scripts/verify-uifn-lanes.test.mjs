import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runExperimentalVerification } from './verify-uifn-experimental.mjs';
import { combineLaneResults } from './verify-uifn-lanes.mjs';
import { runPackageGraphVerification } from './verify-uifn-package-graph.mjs';

const graph = JSON.parse(readFileSync('uifn/package-graph.json', 'utf8'));

test('TV-EXP-001-P preserves separate successful stable and experimental lane results', () => {
  const result = combineLaneResults({ ok: true, checks: [] }, { ok: true, checks: [] });
  assert.equal(result.ok, true);
  assert.equal(result.experimental.ok, true);
  assert.equal(result.experimental.stableBlocking, false);
});

test('TV-EXP-001-N reports an experimental failure without changing the stable result', () => {
  const forbiddenGraph = JSON.parse(JSON.stringify(graph));
  forbiddenGraph.stable.find((entry) => entry.name === '@uifn/components').fixtureDependencies = ['@uifn/sf'];
  const graphResult = runPackageGraphVerification({ graph: forbiddenGraph, inspectWorktree: false, stableOnly: true });
  const experimental = runExperimentalVerification({ fixture: 'patterns', skipCommands: true });
  const result = combineLaneResults({ ok: true, checks: [] }, experimental);
  assert.equal(graphResult.ok, false);
  assert.ok(graphResult.failures.some((failure) => failure.code === 'UIFN_PACKAGE_GRAPH_FORBIDDEN_EDGE' && failure.dependency === '@uifn/sf'));
  assert.equal(experimental.ok, false);
  assert.equal(result.ok, true);
  assert.equal(result.experimental.ok, false);
  assert.ok(result.experimental.checks.some((check) => check.command === 'experimental-fixture:patterns'));
});
