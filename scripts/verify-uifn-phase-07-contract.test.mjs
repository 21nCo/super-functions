import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhase07Mutations, verifyPhase07Contract } from './verify-uifn-phase-07-contract.mjs';

test('TV-PRIM-002-P accepts eight canonical overlay policies and shared DOM ownership', async () => {
  const result = await verifyPhase07Contract();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.primitiveCount, 8);
  assert.equal(result.policyCount, 8);
});

test('TV-PRIM-002-N classifies AlertDialog dismissal and accessible-name defects exactly', () => {
  assert.deepEqual(classifyPhase07Mutations({ alertOutsideDismiss: true }), ['UIFN_ALERT_DIALOG_DISMISSAL']);
  assert.deepEqual(classifyPhase07Mutations({ alertTitleMissing: true }), ['UIFN_ACCESSIBLE_NAME_MISSING']);
  assert.deepEqual(classifyPhase07Mutations({ alertOutsideDismiss: true, alertTitleMissing: true }), ['UIFN_ALERT_DIALOG_DISMISSAL','UIFN_ACCESSIBLE_NAME_MISSING']);
});

test('overlay fork, Tooltip interaction, and resource leak mutations fail closed', () => {
  assert.deepEqual(classifyPhase07Mutations({ localPositioner: true }), ['UIFN_OVERLAY_POLICY_FORK']);
  assert.deepEqual(classifyPhase07Mutations({ tooltipTouchOpens: true }), ['UIFN_TOOLTIP_INTERACTION_INVALID']);
  assert.deepEqual(classifyPhase07Mutations({ resourceLeak: true }), ['UIFN_OVERLAY_RESOURCE_LEAK']);
});
