import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { classifyPhase08Mutations, verifyPhase08Contract } from './verify-uifn-phase-08-contract.mjs';

test('TV-PRIM-003-P accepts seven canonical navigation controllers and shared DOM ownership', async () => {
  const result = await verifyPhase08Contract();
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.primitiveCount, 7); assert.equal(result.keyboardTableCount, 7);
});
test('TV-PRIM-003-N classifies the exact seeded keyboard and removal defects', () => {
  assert.deepEqual(classifyPhase08Mutations({ wrongMenubarRtlDown: true }), ['UIFN_KEYBOARD_MODEL_DIVERGED']);
  assert.deepEqual(classifyPhase08Mutations({ removeActiveWithoutRepair: true }), ['UIFN_NAVIGATION_FOCUS_REPAIR_MISSING']);
  assert.deepEqual(classifyPhase08Mutations({ wrongMenubarRtlDown: true, removeActiveWithoutRepair: true }), ['UIFN_KEYBOARD_MODEL_DIVERGED','UIFN_NAVIGATION_FOCUS_REPAIR_MISSING']);
});
test('policy forks, submenu grace, and resources fail closed', () => {
  assert.deepEqual(classifyPhase08Mutations({ localTypeahead: true }), ['UIFN_NAVIGATION_POLICY_FORK']);
  assert.deepEqual(classifyPhase08Mutations({ submenuGraceMissing: true }), ['UIFN_SUBMENU_GRACE_INVALID']);
  assert.deepEqual(classifyPhase08Mutations({ resourceLeak: true }), ['UIFN_NAVIGATION_RESOURCE_LEAK']);
});
test('the Phase 08 generator rejects contradictory write and check flags', () => {
  const result = spawnSync(process.execPath, [
    'scripts/generate-uifn-phase-08.mjs',
    '--write',
    '--check',
  ], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});
