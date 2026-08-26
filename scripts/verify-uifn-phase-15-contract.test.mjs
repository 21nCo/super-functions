import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHookSource, inspectReusableSource, inspectStyleContract, inspectStyledManifest, inspectStylingOwnership, verifyPhase15 } from './verify-uifn-phase-15.mjs';

test('TV-COMP-001-N kills framework coupling, product content, and styled behavior forks', () => {
  assert.equal(inspectStyledManifest({ dependencies: { '@uifn/react': '0', '@uifn/svelte': '0' } }, 'react')[0]?.code, 'UIFN_STYLED_FRAMEWORK_COUPLING');
  assert.ok(inspectStyledManifest({ dependencies: { '@uifn/react': '0' }, peerDependencies: { react: '*' }, sideEffects: false }, 'react').some((failure) => failure.code === 'UIFN_STYLED_SUBPATH_EXPORT_MISSING'));
  assert.equal(inspectReusableSource('export const title = "Team workspace"')[0]?.code, 'UIFN_COMPONENT_PRODUCT_CONTENT');
  assert.equal(inspectReusableSource('createDialogController({})')[0]?.code, 'UIFN_STYLED_BEHAVIOR_FORK');
});

test('TV-COMP-001-N locks permanent unstyled, headless, and styled ownership', () => {
  const manifests = {
    '@uifn/core': { uifn: { layer: 'core', styling: 'styled' } },
  };
  const failures = inspectStylingOwnership(manifests);
  assert.ok(failures.some((failure) => failure.code === 'UIFN_STYLING_BOUNDARY_VIOLATION' && failure.package === '@uifn/core'));
  assert.ok(failures.some((failure) => failure.code === 'UIFN_STYLING_BOUNDARY_MANIFEST_MISSING' && failure.package === '@uifn/components'));
});

test('TV-STYLE-001-N kills missing reduced motion and hardcoded semantic colors', () => {
  const failures = inspectStyleContract('[dir="rtl"] [data-uifn-density]{color:#fff}@media (forced-colors: active){x{color:CanvasText;outline:Highlight}}');
  assert.ok(failures.some((failure) => failure.code === 'UIFN_REDUCED_MOTION_VIOLATION'));
  assert.ok(failures.some((failure) => failure.code === 'UIFN_STYLE_SEMANTIC_COLOR_HARDCODED'));
});

test('TV-HOOK-001-N kills behavior forks and ambient SSR globals', () => {
  const failures = inspectHookSource('createDismissableLayer(); const doc = window.document;');
  assert.ok(failures.some((failure) => failure.code === 'UIFN_HOOK_BEHAVIOR_FORK'));
  assert.ok(failures.some((failure) => failure.code === 'UIFN_SSR_BROWSER_GLOBAL'));
});

test('static Phase 15 contract covers all requirements and vectors', () => {
  const result = verifyPhase15({ staticOnly: true });
  assert.equal(result.status, 'passed', JSON.stringify(result.failures));
  assert.deepEqual(result.requirements, { 'COMP-001': 'passed', 'STYLE-001': 'passed', 'HOOK-001': 'passed' });
  assert.equal(result.mutations.every((mutation) => mutation.killed), true);
});
