#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
if (!mode) { console.error('Usage: node scripts/generate-uifn-phase-09.mjs (--write|--check)'); process.exit(2); }

const outputRoot = path.resolve(process.cwd(), 'uifn/.conduct/generated/phase-09');
const primitives = [
  { name: 'Checkbox', requirement: 'PRIM-004', factory: 'createCheckboxController', parts: ['root','control','indicator','label','hiddenInput'] },
  { name: 'CheckboxGroup', requirement: 'PRIM-004', factory: 'createCheckboxGroupController', parts: ['root','label','item','itemControl','itemIndicator','hiddenInput','error'] },
  { name: 'Combobox', requirement: 'PRIM-004', factory: 'createComboboxController', parts: ['root','label','control','input','trigger','clear','positioner','content','item','itemIndicator','empty','hiddenInput'] },
  { name: 'Listbox', requirement: 'PRIM-004', factory: 'createListboxController', parts: ['root','label','content','item','itemIndicator','group','groupLabel','hiddenInput'] },
  { name: 'RadioGroup', requirement: 'PRIM-004', factory: 'createRadioGroupController', parts: ['root','label','item','itemControl','itemIndicator','hiddenInput','error'] },
  { name: 'SegmentGroup', requirement: 'PRIM-004', factory: 'createSegmentGroupController', parts: ['root','label','item','itemText','indicator','hiddenInput'] },
  { name: 'Select', requirement: 'PRIM-004', factory: 'createSelectController', parts: ['root','label','control','trigger','valueText','clear','positioner','content','item','itemText','itemIndicator','group','groupLabel','hiddenInput'] },
  { name: 'TagsInput', requirement: 'PRIM-004', factory: 'createTagsInputController', parts: ['root','label','control','item','itemText','itemDelete','input','clear','hiddenInput','error'] },
  { name: 'Toggle', requirement: 'PRIM-004', factory: 'createToggleController', parts: ['root'] },
  { name: 'ToggleGroup', requirement: 'PRIM-004', factory: 'createToggleGroupController', parts: ['root','item'] },
  { name: 'Autocomplete', requirement: 'PRIM-005', factory: 'createAutocompleteController', parts: ['root','label','control','input','clear','positioner','content','item','empty'] },
  { name: 'Clipboard', requirement: 'PRIM-005', factory: 'createClipboardController', parts: ['root','trigger','status'] },
  { name: 'Editable', requirement: 'PRIM-005', factory: 'createEditableController', parts: ['root','label','preview','input','control','submit','cancel','error','hiddenInput'] },
  { name: 'FileUpload', requirement: 'PRIM-005', factory: 'createFileUploadController', parts: ['root','label','dropzone','trigger','input','itemGroup','item','itemName','itemSize','itemDelete','error','status'] },
  { name: 'NumberInput', requirement: 'PRIM-005', factory: 'createNumberInputController', parts: ['root','label','control','input','increment','decrement','scrubber','hiddenInput','error'] },
  { name: 'PasswordInput', requirement: 'PRIM-005', factory: 'createPasswordInputController', parts: ['root','label','input','visibilityTrigger','strength','error'] },
  { name: 'PinInput', requirement: 'PRIM-005', factory: 'createPinInputController', parts: ['root','label','control','input','hiddenInput','error'] },
];
const contracts = {
  selection: ['controlled-uncontrolled','single-multiple','nullable-required','disabled-readonly','dynamic-repair','native-form','explicit-serialization','async-reconciliation','reset'],
  input: ['ime-deferred-commit','caret','paste','autofill','locale-step','capability-injection','permission-errors','secret-redaction','reset'],
  browsers: ['chromium','firefox','webkit','mobile-chromium','mobile-webkit'],
  frameworks: ['react','svelte','solid'],
  negativeCodes: ['UIFN_CONTROLLED_STATE_DIVERGED','UIFN_FORM_VALUE_SERIALIZATION','UIFN_IME_COMMIT_EARLY','UIFN_TRACE_SECRET'],
};
const header = { schemaVersion: 1, generatedBy: 'generate-uifn-phase-09.mjs', phase: 'PHASE_09', implementationEvidence: true };
const outputs = {
  'phase-09-exports.json': `${JSON.stringify({ ...header, primitives }, null, 2)}\n`,
  'phase-09-input-contracts.json': `${JSON.stringify({ ...header, contracts }, null, 2)}\n`,
  'phase-09-test-manifest.json': `${JSON.stringify({
    ...header,
    requirements: ['PRIM-004','PRIM-005'],
    vectors: ['TV-PRIM-004-P','TV-PRIM-004-N','TV-PRIM-005-P','TV-PRIM-005-N','TV-DOM-007-P/N'],
    fixtures: ['Japanese IME','object-value form','disabled fieldset','controlled race','denied clipboard','file rejection','password redaction','reset'],
    browsers: contracts.browsers,
    frameworks: contracts.frameworks,
    modes: ['package','source'],
    suites: ['uifn/core/src/__tests__/phase-09-selection-input.test.ts','uifn/dom/browser/input-primitives.spec.ts','uifn/adapter-kit/src/__tests__/conformance.test.ts','scripts/verify-uifn-phase-09-contract.test.mjs'],
  }, null, 2)}\n`,
};

try {
  if (mode === 'write') {
    await mkdir(outputRoot, { recursive: true });
    await Promise.all(Object.entries(outputs).map(([name, contents]) => writeFile(path.join(outputRoot, name), contents, 'utf8')));
  } else {
    for (const [name, expected] of Object.entries(outputs)) {
      const actual = await readFile(path.join(outputRoot, name), 'utf8');
      const equal = name.endsWith('.json') ? JSON.stringify(JSON.parse(actual)) === JSON.stringify(JSON.parse(expected)) : actual === expected;
      if (!equal) throw new Error(`UIFN_PHASE_09_GENERATED_DRIFT: ${name}`);
    }
  }
  console.log(JSON.stringify({ ok: true, command: `generate:uifn-phase-09:${mode}`, outputCount: Object.keys(outputs).length, primitiveCount: primitives.length }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ ok: false, command: `generate:uifn-phase-09:${mode}`, error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exit(1);
}
