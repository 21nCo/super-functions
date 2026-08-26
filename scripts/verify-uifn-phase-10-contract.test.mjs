import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPhase10Mutations, verifyPhase10Contract } from './verify-uifn-phase-10-contract.mjs';

test('TV-PRIM-006-P through TV-I18N-001-P accept all fourteen Phase 10 and sixty-nine catalog contracts', async () => {
  const result = await verifyPhase10Contract();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.primitiveCount, 14);
  assert.equal(result.catalogPrimitiveCount, 69);
  assert.equal(result.canonicalLogicComplete, true);
});

test('TV-PRIM-006-N classifies terminal gesture and RTL-axis mutations exactly', () => {
  assert.deepEqual(classifyPhase10Mutations({ gestureAfterCancel: true }), ['UIFN_GESTURE_AFTER_CANCEL']);
  assert.deepEqual(classifyPhase10Mutations({ wrongRtlAxis: true }), ['UIFN_RANGE_DIRECTION_INVALID']);
});

test('TV-PRIM-007-N classifies ambient date, invalid color, and accumulating timer mutations exactly', () => {
  assert.deepEqual(classifyPhase10Mutations({ ambientDateParse: true }), ['UIFN_AMBIENT_DATE_PARSE']);
  assert.deepEqual(classifyPhase10Mutations({ invalidColor: true }), ['UIFN_COLOR_VALUE_INVALID']);
  assert.deepEqual(classifyPhase10Mutations({ accumulatingTimer: true }), ['UIFN_TIMER_DRIFT_BUDGET']);
});

test('TV-PRIM-008-N and TV-I18N-001-N classify announcement, lifecycle, and localization failures exactly', () => {
  assert.deepEqual(classifyPhase10Mutations({ announcementFlood: true }), ['UIFN_ANNOUNCEMENT_FLOOD']);
  assert.deepEqual(classifyPhase10Mutations({ timerAfterDestroy: true }), ['UIFN_TIMER_AFTER_DESTROY']);
  assert.deepEqual(classifyPhase10Mutations({ hardcodedEnglish: true }), ['UIFN_UNLOCALIZED_DEFAULT']);
  assert.deepEqual(classifyPhase10Mutations({ rtlKeyboardMirroredIncorrectly: true }), ['UIFN_RTL_KEYBOARD_DIVERGED']);
});
