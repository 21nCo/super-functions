import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runPackageGraphVerification, sourceImportSpecifiers } from './verify-uifn-package-graph.mjs';

const graph = JSON.parse(readFileSync('uifn/package-graph.json', 'utf8'));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('TV-SCOPE-001-P validates the live stable/private/experimental DAG', () => {
  const result = runPackageGraphVerification({ stableOnly: process.env.UIFN_EXPERIMENTAL_ABSENT === '1' });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.deepEqual(result.stableFrameworks, ['react', 'svelte', 'solid']);
  assert.equal(result.packages.stable.length, 16);
  assert.equal(result.packages.experimental.length, 2);
  assert.deepEqual(result.cycles, []);
});

test('TV-SCOPE-001-N rejects a forbidden neutral-to-framework edge and a cycle', () => {
  const fixture = clone(graph);
  fixture.stable.find((node) => node.name === '@uifn/components').fixtureDependencies = ['@uifn/react'];
  fixture.stable.find((node) => node.name === '@uifn/core').fixtureDependencies = ['@uifn/adapter-kit'];
  const result = runPackageGraphVerification({ graph: fixture, inspectWorktree: false });
  const codes = result.failures.map((failure) => failure.code);
  assert.equal(result.ok, false);
  assert.ok(codes.includes('UIFN_PACKAGE_GRAPH_FORBIDDEN_EDGE'));
  assert.ok(codes.includes('UIFN_PACKAGE_GRAPH_CYCLE'));
  assert.ok(result.failures.some((failure) => failure.path?.includes('@uifn/components') && failure.path?.includes('@uifn/react')));
  assert.ok(result.failures.some((failure) => failure.path?.includes('@uifn/core') && failure.path?.includes('@uifn/adapter-kit')));
});

test('missing public entrypoint ownership fails closed', () => {
  const fixture = clone(graph);
  delete fixture.stable.find((node) => node.name === '@uifn/components').owner;
  const result = runPackageGraphVerification({ graph: fixture, inspectWorktree: false });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.code === 'UIFN_PACKAGE_GRAPH_OWNER_MISSING' && failure.package === '@uifn/components'));
});

test('stable-only graph does not require experimental workspaces', () => {
  const result = runPackageGraphVerification({ graph, inspectWorktree: false, stableOnly: true });
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.equal(result.mode, 'stable-only');
});

test('Svelte import filtering accepts whitespace before a script end tag', () => {
  assert.deepEqual(
    [...sourceImportSpecifiers(
      '<script>import "@uifn/core";</script\t\n ignored><script context="module">export { value } from "@uifn/dom";</script >',
      'fixture.svelte',
    )],
    ['@uifn/core', '@uifn/dom'],
  );
});
