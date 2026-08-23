#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const PRIMITIVES = Object.freeze([
  'Checkbox','CheckboxGroup','Combobox','Listbox','RadioGroup','SegmentGroup','Select','TagsInput','Toggle','ToggleGroup',
  'Autocomplete','Clipboard','Editable','FileUpload','NumberInput','PasswordInput','PinInput',
]);
const FACTORIES = Object.freeze(PRIMITIVES.map((name) => `create${name}Controller`));
const FILES = Object.freeze(PRIMITIVES.map((name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()));
const ANATOMY = Object.freeze({
  Checkbox: ['root','control','indicator','label','hiddenInput'],
  CheckboxGroup: ['root','label','item','itemControl','itemIndicator','hiddenInput','error'],
  Combobox: ['root','label','control','input','trigger','clear','positioner','content','item','itemIndicator','empty','hiddenInput'],
  Listbox: ['root','label','content','item','itemIndicator','group','groupLabel','hiddenInput'],
  RadioGroup: ['root','label','item','itemControl','itemIndicator','hiddenInput','error'],
  SegmentGroup: ['root','label','item','itemText','indicator','hiddenInput'],
  Select: ['root','label','control','trigger','valueText','clear','positioner','content','item','itemText','itemIndicator','group','groupLabel','hiddenInput'],
  TagsInput: ['root','label','control','item','itemText','itemDelete','input','clear','hiddenInput','error'],
  Toggle: ['root'], ToggleGroup: ['root','item'],
  Autocomplete: ['root','label','control','input','clear','positioner','content','item','empty'],
  Clipboard: ['root','trigger','status'],
  Editable: ['root','label','preview','input','control','submit','cancel','error','hiddenInput'],
  FileUpload: ['root','label','dropzone','trigger','input','itemGroup','item','itemName','itemSize','itemDelete','error','status'],
  NumberInput: ['root','label','control','input','increment','decrement','scrubber','hiddenInput','error'],
  PasswordInput: ['root','label','input','visibilityTrigger','strength','error'],
  PinInput: ['root','label','control','input','hiddenInput','error'],
});

function issue(code, message, source) { return Object.freeze({ code, message, source }); }

export function classifyPhase09Mutations(mutations) {
  const codes = [];
  if (mutations.controlledSelectMutates || mutations.staleControlledCommit) codes.push('UIFN_CONTROLLED_STATE_DIVERGED');
  if (mutations.implicitObjectStringification) codes.push('UIFN_FORM_VALUE_SERIALIZATION');
  if (mutations.filterDuringComposition || mutations.maskDuringComposition) codes.push('UIFN_IME_COMMIT_EARLY');
  if (mutations.passwordInTrace || mutations.fileContentInTrace) codes.push('UIFN_TRACE_SECRET');
  if (mutations.ambientClipboard || mutations.fakeFileSuccess) codes.push('UIFN_INPUT_CAPABILITY_UNAVAILABLE');
  if (mutations.resourceLeak) codes.push('UIFN_INPUT_RESOURCE_LEAK');
  return Object.freeze(codes);
}

function configFor(name) {
  if (name === 'Checkbox') return { defaultChecked: true };
  if (name === 'CheckboxGroup') return { items: ['a','b'], defaultValue: ['a'] };
  if (['Combobox','Listbox','RadioGroup','SegmentGroup','Select','Autocomplete'].includes(name)) return { items: ['a','b'], defaultValue: 'a' };
  if (name === 'TagsInput') return { defaultValue: ['a'] };
  if (name === 'Toggle') return { defaultPressed: true };
  if (name === 'ToggleGroup') return { items: ['a','b'], type: 'multiple', defaultValue: ['a'] };
  if (name === 'Clipboard') return { capability: { writeText: async () => undefined } };
  if (name === 'Editable') return { defaultValue: 'draft' };
  if (name === 'FileUpload') return {};
  if (name === 'NumberInput') return { defaultValue: '1', step: 1 };
  if (name === 'PasswordInput') return { defaultValue: 'secret' };
  return { defaultValue: '12', length: 4 };
}

export async function verifyPhase09Contract({ requireDist = false } = {}) {
  const issues = [];
  const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'uifn/catalog/generated/catalog.json'), 'utf8'));
  const expected = ['Autocomplete','Checkbox','CheckboxGroup','Clipboard','Combobox','Editable','FileUpload','Listbox','NumberInput','PasswordInput','PinInput','RadioGroup','SegmentGroup','Select','TagsInput','Toggle','ToggleGroup'];
  const selected = catalog.primitives.filter((primitive) => expected.includes(primitive.name)).map((primitive) => primitive.name);
  if (JSON.stringify(selected) !== JSON.stringify(expected)) {
    issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', 'PHASE_09 catalog ownership differs from the reviewed seventeen-primitive set plus inherited Switch.', 'uifn/catalog/generated/catalog.json'));
  }

  const sources = Object.fromEntries(FILES.map((file) => {
    const location = path.join(repoRoot, `uifn/core/src/primitives/${file}.ts`);
    if (!existsSync(location)) issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `Missing ${file} controller source.`, location));
    return [file, existsSync(location) ? readFileSync(location, 'utf8') : ''];
  }));
  const combined = Object.values(sources).join('\n');
  for (const pattern of [/create[A-Z][A-Za-z0-9]*Model\b/, /\b(?:document|window|navigator)\s*\./, /String\([^)]*value[^)]*\)/]) {
    if (pattern.test(combined)) issues.push(issue(pattern.source.includes('String') ? 'UIFN_FORM_VALUE_SERIALIZATION' : 'UIFN_CONTROLLED_STATE_DIVERGED', `Core input source matched forbidden behavior ${pattern}.`, 'uifn/core/src/primitives'));
  }
  for (const symbol of ['createUIFnSelectionPrimitiveController','normalizeUIFnSelectionItems']) if (!readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/selection-control.ts'), 'utf8').includes(symbol)) {
    issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `Canonical selection substrate omits ${symbol}.`, 'uifn/core/src/primitives/selection-control.ts'));
  }
  for (const symbol of ['compositionStart','compositionEnd','parseUIFnLocaleNumber','getInputValue']) if (!readFileSync(path.join(repoRoot, 'uifn/core/src/primitives/input-control.ts'), 'utf8').includes(symbol)) {
    issues.push(issue('UIFN_IME_COMMIT_EARLY', `Canonical input substrate omits ${symbol}.`, 'uifn/core/src/primitives/input-control.ts'));
  }
  const domSource = readFileSync(path.join(repoRoot, 'uifn/dom/src/input.ts'), 'utf8');
  for (const symbol of ['createUIFnSelectionFormBinding','createUIFnTextInputFormBinding','createUIFnClipboardCapability','createUIFnNativeFilePickerCapability','createUIFnFileInputBinding','assertUIFnInputResourcesReleased']) if (!domSource.includes(symbol)) {
    issues.push(issue('UIFN_INPUT_CAPABILITY_UNAVAILABLE', `Input DOM boundary omits ${symbol}.`, 'uifn/dom/src/input.ts'));
  }
  if (/globalThis\.(?:navigator|document|window)/.test(domSource)) issues.push(issue('UIFN_INPUT_CAPABILITY_UNAVAILABLE', 'Input DOM boundary reads an ambient global instead of its injected root.', 'uifn/dom/src/input.ts'));

  for (const name of PRIMITIVES) {
    const directory = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const sourcePath = `uifn/react/src/generated/${directory}.tsx`;
    const source = readFileSync(path.join(repoRoot, sourcePath), 'utf8');
    if (!source.includes(`export const ${name} =`) || !source.includes(`export function use${name}`)) {
      issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `react generated public surface omits ${name} compound or hook.`, sourcePath));
    }
  }
  for (const name of PRIMITIVES) {
    const directory = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const sourcePath = `uifn/solid/src/generated/${directory}.tsx`;
    const source = readFileSync(path.join(repoRoot, sourcePath), 'utf8');
    if (!source.includes(`export const ${name} =`)) {
      issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `solid compound surface omits ${name}.`, sourcePath));
    }
  }
  for (const name of PRIMITIVES) {
    const directory = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    const sourcePath = `uifn/svelte/lib/generated/${directory}/index.ts`;
    const source = readFileSync(path.join(repoRoot, sourcePath), 'utf8');
    if (!source.includes(`export const ${name}`) || !source.includes(`export const ${name}Provider`)) {
      issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `svelte compound surface omits ${name}.`, sourcePath));
    }
  }

  let publicCore = null;
  if (requireDist) {
    const dist = path.join(repoRoot, 'uifn/core/dist/index.mjs');
    if (!existsSync(dist)) issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', 'Built core entrypoint is missing.', dist));
    else publicCore = await import(`${pathToFileURL(dist).href}?phase09=${Date.now()}`);
  }
  if (publicCore) {
    for (const factory of FACTORIES) if (typeof publicCore[factory] !== 'function') issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `Public core omits ${factory}.`, 'uifn/core/dist/index.mjs'));
    for (const name of PRIMITIVES) {
      const controller = publicCore[`create${name}Controller`](configFor(name), { generateId: (scope) => `phase09-${name}-${scope}` });
      if (JSON.stringify(Object.keys(controller.parts)) !== JSON.stringify(ANATOMY[name])) issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', `${name} anatomy differs from contract.`, 'uifn/core/dist/index.mjs'));
      controller.destroy();
    }

    const controlled = publicCore.createSelectController({ items: ['a','b'], value: 'a' });
    controlled.actions.select('b');
    if (controlled.state.value !== 'a' || controlled.state.requestedValue !== 'b') issues.push(issue('UIFN_CONTROLLED_STATE_DIVERGED', 'Controlled Select mutated before owner reconciliation.', 'uifn/core/dist/index.mjs'));
    controlled.destroy();

    try {
      publicCore.createSelectController({ items: [{ id: 'object', value: { id: 1 } }], defaultValue: 'object', name: 'value' });
      issues.push(issue('UIFN_FORM_VALUE_SERIALIZATION', 'Object selection implicitly serialized.', 'uifn/core/dist/index.mjs'));
    } catch (error) {
      if (error?.code !== 'UIFN_FORM_VALUE_SERIALIZATION') issues.push(issue('UIFN_FORM_VALUE_SERIALIZATION', 'Object selection failed with an unstable error.', 'uifn/core/dist/index.mjs'));
    }

    const ime = publicCore.createAutocompleteController({ items: [{ value: 'tokyo', textValue: '東京' }] });
    ime.actions.compositionStart(); ime.actions.compositionUpdate('とう');
    if (ime.state.inputValue !== '' || ime.state.visibleItems[0] !== 'tokyo') issues.push(issue('UIFN_IME_COMMIT_EARLY', 'Autocomplete committed or filtered during composition.', 'uifn/core/dist/index.mjs'));
    ime.actions.compositionEnd('東京'); ime.destroy();

    const secret = 'phase09-contract-secret';
    const password = publicCore.createPasswordInputController({ defaultValue: secret });
    if (JSON.stringify(password.snapshot).includes(secret)) issues.push(issue('UIFN_TRACE_SECRET', 'Password state exposed raw secret data.', 'uifn/core/dist/index.mjs'));
    password.destroy();
  }

  return Object.freeze({
    ok: issues.length === 0,
    command: 'verify:uifn-phase-09-contract',
    requirements: ['PRIM-004','PRIM-005'],
    vectors: ['TV-PRIM-004-P','TV-PRIM-004-N','TV-PRIM-005-P','TV-PRIM-005-N','TV-DOM-007-P/N'],
    primitiveCount: PRIMITIVES.length,
    inheritedPrimitiveCount: 1,
    frameworks: ['react','svelte','solid'],
    issues,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const result = await verifyPhase09Contract({ requireDist: process.argv.includes('--require-dist') });
  console[result.ok ? 'log' : 'error'](JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
