import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyControllerMutations,
  inspectControllerContract,
  loadControllerContractInput,
} from './verify-uifn-controller-contract.mjs';

test('TV-ARCH-002-P / TV-ARCH-003-P / TV-ENV-001-P: current source contract passes', () => {
  assert.deepEqual(inspectControllerContract(loadControllerContractInput()), []);
});

test('TV-ARCH-002-N: a controller surface without update fails closed', () => {
  const input = loadControllerContractInput();
  input.controllerSource = input.controllerSource.replace('  update(inputs: Partial<TInputs>): void;\n', '');
  assert.ok(inspectControllerContract(input).some((entry) => entry.code === 'UIFN_CONTROLLER_CONTRACT_INVALID'));
});

test('TV-ARCH-003-N: legacy export and consumer paths report the exact code and locations', () => {
  const input = loadControllerContractInput();
  input.scanFiles['uifn/core/src/legacy-seed.ts'] = 'export interface StateMachine {}';
  input.scanFiles['uifn/svelte/src/LegacySeed.svelte'] = 'const value = createCombobox({});';
  const failures = inspectControllerContract(input).filter((entry) => entry.code === 'UIFN_LEGACY_BEHAVIOR_PATH');
  assert.deepEqual(new Set(failures.map((entry) => entry.path)), new Set([
    'uifn/core/src/legacy-seed.ts',
    'uifn/svelte/src/LegacySeed.svelte',
  ]));
});

test('TV-ENV-001-N: an ambient document read reports UIFN_CORE_BROWSER_GLOBAL', () => {
  const input = loadControllerContractInput();
  input.sourceFiles['uifn/core/src/ambient-seed.ts'] = 'export const owner = document.body;';
  assert.ok(inspectControllerContract(input).some((entry) => (
    entry.code === 'UIFN_CORE_BROWSER_GLOBAL' && entry.path === 'uifn/core/src/ambient-seed.ts'
  )));
});

test('TV-PART-001-N and all phase mutations retain stable classifications', () => {
  assert.deepEqual(classifyControllerMutations({
    missingUpdate: true,
    legacyExport: true,
    legacyConsumer: true,
    generatedFirst: true,
    invariantOverridden: true,
    browserGlobal: true,
    missingCapability: true,
  }), [
    'UIFN_CONTROLLER_CONTRACT_INVALID',
    'UIFN_LEGACY_BEHAVIOR_PATH',
    'UIFN_HANDLER_ORDER_INVALID',
    'UIFN_PART_INVARIANT_OVERRIDDEN',
    'UIFN_CORE_BROWSER_GLOBAL',
    'UIFN_ENV_CAPABILITY_MISSING',
  ]);
});
