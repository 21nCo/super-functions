import assert from 'node:assert/strict';
import test from 'node:test';
import { runCleanVerification, scanRemovedFrameworkReferences } from './verify-uifn-clean.mjs';

test('TV-CLEAN-001-P proves removed framework surfaces are absent from the active product tree', () => {
  const result = runCleanVerification();
  assert.equal(result.ok, true, JSON.stringify(result.failures, null, 2));
  assert.ok(result.historicalReferencesPreserved > 0);
  assert.ok(result.deletedPaths.includes('uifn/components/dist/vue'));
  assert.ok(result.deletedPaths.includes('uifn/components/dist/angular'));
});

test('TV-CLEAN-001-N rejects removed peer and registry selections with the exact cleanup code', () => {
  const manifest = JSON.stringify({
    peerDependencies: { '@uifn/vue': '0.0.1' },
    registryFramework: 'angular',
    frameworks: 5,
    entry: 'uifn/components/src/react/batch-a.ts',
  });
  const failures = scanRemovedFrameworkReferences('fixtures/removed-package.json', manifest);
  assert.deepEqual(
    new Set(failures.map((failure) => failure.code)),
    new Set(['UIFN_REMOVED_FRAMEWORK_REFERENCE', 'UIFN_ALL_FRAMEWORK_ASSUMPTION', 'UIFN_LEGACY_COMPONENTS_SUBPATH']),
  );
  assert.deepEqual(new Set(failures.map((failure) => failure.framework).filter(Boolean)), new Set(['vue', 'angular']));
});
