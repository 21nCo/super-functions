import { describe, expect, it, vi } from 'vitest';
import { UIFnError } from '../errors';
import {
  createAutocompleteController,
  createCheckboxController,
  createCheckboxGroupController,
  createClipboardController,
  createComboboxController,
  createEditableController,
  createFileUploadController,
  createListboxController,
  createNumberInputController,
  createPasswordInputController,
  createPinInputController,
  createRadioGroupController,
  createSegmentGroupController,
  createSelectController,
  createTagsInputController,
  createToggleController,
  createToggleGroupController,
  type UIFnSelectionItemAdapter,
} from '../primitives';

describe('PHASE_09 selection and input vectors', () => {
  it('TV-PRIM-004-P exposes canonical state and anatomy for all ten selection primitives', () => {
    const controllers = [
      createCheckboxController({ defaultChecked: true }),
      createCheckboxGroupController({ items: ['a', 'b'], defaultValue: ['a'] }),
      createComboboxController({ items: ['a', 'b'], defaultValue: 'a' }),
      createListboxController({ items: ['a', 'b'], defaultValue: 'a' }),
      createRadioGroupController({ items: ['a', 'b'], defaultValue: 'a' }),
      createSegmentGroupController({ items: ['a', 'b'], defaultValue: 'a' }),
      createSelectController({ items: ['a', 'b'], defaultValue: 'a' }),
      createTagsInputController({ defaultValue: ['a'] }),
      createToggleController({ defaultPressed: true }),
      createToggleGroupController({ items: ['a', 'b'], type: 'multiple', defaultValue: ['a'] }),
    ];

    expect(controllers.map((controller) => controller.state.primitive)).toEqual([
      'Checkbox', 'CheckboxGroup', 'Combobox', 'Listbox', 'RadioGroup',
      'SegmentGroup', 'Select', 'TagsInput', 'Toggle', 'ToggleGroup',
    ]);
    for (const controller of controllers) {
      expect(controller.state.ids.root).toBeTruthy();
      expect(controller.state.items).not.toBe(controller.state.selectedKeys);
      expect(controller.state.lastErrorCode).toBeNull();
      controller.destroy();
    }
  });

  it('TV-PRIM-005-P exposes composition-safe state and anatomy for all seven input primitives', () => {
    const controllers = [
      createAutocompleteController({ items: ['a', 'b'] }),
      createClipboardController({ capability: { writeText: async () => {} } }),
      createEditableController({ defaultValue: 'draft' }),
      createFileUploadController(),
      createNumberInputController({ defaultValue: '1' }),
      createPasswordInputController({ defaultValue: 'password' }),
      createPinInputController({ defaultValue: '12', length: 4 }),
    ];

    expect(controllers.map((controller) => Object.keys(controller.parts).length)).toEqual([9, 3, 9, 12, 9, 6, 6]);
    controllers.forEach((controller) => controller.destroy());
  });

  it('TV-PRIM-004-P serializes object values only through an explicit stable adapter', () => {
    type City = { id: number; name: string };
    const cities: City[] = [{ id: 1, name: 'Tokyo' }, { id: 2, name: 'Osaka' }];
    const adapter: UIFnSelectionItemAdapter<City> = {
      getKey: (city) => city.id,
      getTextValue: (city) => city.name,
      serialize: (city) => `city:${city.id}`,
    };
    const controller = createSelectController({
      items: cities,
      itemAdapter: adapter,
      defaultValue: '2',
      name: 'city',
    });

    expect(controller.state.value).toBe('2');
    expect(controller.state.formValues).toEqual(['city:2']);
    expect(controller.actions.getFormValue()).toEqual({ city: 'city:2' });
    expect(JSON.stringify(controller.state)).not.toContain('[object Object]');
    controller.destroy();
  });

  it('TV-PRIM-004-P keeps single Listbox native form state synchronized after selection', () => {
    const single = createListboxController({
      items: ['member', 'administrator'],
      defaultValue: 'member',
      name: 'role',
    });
    expect(single.parts.hiddenInput.getProps('member').attributes?.value).toBe('member');
    single.actions.select('administrator', 'pointer');
    expect(single.state.formValues).toEqual(['administrator']);
    expect(single.parts.hiddenInput.getProps('member').attributes?.value).toBe('administrator');

    const multiple = createListboxController({
      items: ['member', 'administrator'],
      defaultValue: ['member', 'administrator'],
      multiple: true,
      name: 'roles',
    });
    expect(multiple.parts.hiddenInput.getProps('administrator').attributes?.value).toBe('administrator');
    single.destroy();
    multiple.destroy();
  });

  it('TV-PRIM-004-P keeps Select keyboard ownership on the combobox trigger', () => {
    const controller = createSelectController({
      items: ['alpha', 'beta'],
      defaultValue: 'alpha',
      defaultOpen: true,
    });
    const preventDefault = vi.fn();

    controller.parts.trigger.getProps().on?.keydown?.({ key: 'Escape', preventDefault });
    expect(controller.state.open).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);

    controller.parts.trigger.getProps().on?.keydown?.({ key: 'ArrowDown', preventDefault });
    expect(controller.state.open).toBe(true);
    expect(controller.state.highlightedItem).toBe('beta');

    controller.parts.trigger.getProps().on?.keydown?.({ key: 'Enter', preventDefault });
    expect(controller.state.value).toBe('beta');
    expect(controller.state.open).toBe(false);
    controller.destroy();
  });

  it('TV-PRIM-004-P assigns active descendant ownership to the actual combobox element', () => {
    const combobox = createComboboxController({
      items: ['alpha', 'beta'],
      defaultOpen: true,
    });
    combobox.parts.input.getProps().on?.keydown?.({ key: 'ArrowDown' });

    expect(combobox.parts.input.getProps().aria?.activedescendant).toBe(
      combobox.parts.item.getProps('beta').id,
    );
    expect(combobox.parts.trigger.getProps().aria?.activedescendant).toBeUndefined();

    const select = createSelectController({
      items: ['alpha', 'beta'],
      defaultOpen: true,
    });
    select.parts.trigger.getProps().on?.keydown?.({ key: 'ArrowDown' });
    expect(select.parts.trigger.getProps().aria?.activedescendant).toBe(
      select.parts.item.getProps('beta').id,
    );

    combobox.destroy();
    select.destroy();
  });

  it('TV-PRIM-004-P replaces the selected item when a single ToggleGroup toggles a different item', () => {
    const controller = createToggleGroupController({
      items: ['left', 'center', 'right'],
      type: 'single',
      defaultValue: 'left',
    });

    controller.parts.item.getProps('center').on?.click?.({ type: 'click' });

    expect(controller.state.value).toBe('center');
    expect(controller.state.selectedKeys).toEqual(['center']);
    expect(controller.parts.item.getProps('left').aria?.pressed).toBe(false);
    expect(controller.parts.item.getProps('center').aria?.pressed).toBe(true);
    controller.destroy();
  });

  it('TV-PRIM-004-P commits and removes TagsInput values through its input keyboard contract', () => {
    const controller = createTagsInputController({
      defaultValue: ['alpha'],
      name: 'tags',
    });
    const preventDefault = vi.fn();
    const input = controller.parts.input;

    input.getProps().on?.input?.({ value: 'release' });
    input.getProps().on?.keydown?.({ key: 'Enter', preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(controller.state.selectedKeys).toEqual(['alpha', 'release']);
    expect(controller.state.inputValue).toBe('');
    expect(controller.state.formValues).toEqual(['alpha', 'release']);

    input.getProps().on?.keydown?.({ key: 'Backspace' });
    expect(controller.state.selectedKeys).toEqual(['alpha']);
    controller.destroy();
  });

  it('TV-PRIM-004-P commits an editable single-selection label into the text input', () => {
    const items = [
      { id: 'one', value: 'one', label: 'First option', textValue: 'First option' },
      { id: 'two', value: 'two', label: 'Second option', textValue: 'Second option' },
    ];
    for (const controller of [
      createAutocompleteController({ items }),
      createComboboxController({ items, defaultValue: 'one' }),
    ]) {
      controller.actions.setInputValue('Second');
      controller.parts.item.getProps('two').on?.click?.({ type: 'click' });
      expect(controller.state.value).toBe('two');
      expect(controller.state.inputValue).toBe('Second option');
      controller.actions.clear();
      expect(controller.state.inputValue).toBe('');
      controller.destroy();
    }
  });

  it('honors Editable controlled and default editing inputs', () => {
    const uncontrolled = createEditableController({ defaultEditing: true });
    expect(uncontrolled.state.editing).toBe(true);
    uncontrolled.actions.cancel();
    expect(uncontrolled.state.editing).toBe(false);
    uncontrolled.destroy();

    const changes: boolean[] = [];
    const controlled = createEditableController({
      editing: true,
      onEditingChange: (editing) => changes.push(editing),
    });
    controlled.actions.submit();
    expect(controlled.state.editing).toBe(true);
    expect(changes).toEqual([false]);
    controlled.update({ editing: false });
    expect(controlled.state.editing).toBe(false);
    controlled.update({ editing: true });
    expect(controlled.state.editing).toBe(true);
    controlled.destroy();
  });

  it('TV-PRIM-004-P keeps Checkbox form values separate from controlled checked state', () => {
    const controller = createCheckboxController({ value: 'accepted', defaultChecked: false, name: 'terms' });
    expect(controller.state.controlled).toBe(false);
    expect(controller.parts.root.getProps().on?.click).toBeUndefined();
    controller.actions.setChecked(true);
    expect(controller.state.checked).toBe(true);
    expect(controller.actions.getFormValue()).toEqual({ terms: 'accepted' });
    controller.destroy();
  });

  it('TV-PRIM-004-P keeps the Checkbox indicator synchronized with checked state', () => {
    const controller = createCheckboxController({ defaultChecked: true });

    expect(controller.parts.indicator.getProps()).toMatchObject({
      hidden: false,
      data: { state: 'checked', value: 'on' },
      aria: { hidden: false },
    });

    controller.actions.setChecked(false);
    expect(controller.parts.indicator.getProps()).toMatchObject({
      hidden: true,
      data: { state: 'unchecked', value: 'on' },
      aria: { hidden: true },
    });
    controller.destroy();
  });

  it('TV-PRIM-004-P preserves disabled Checkbox diagnostics without enabled label activation', () => {
    const enabled = createCheckboxController({ defaultChecked: false });
    expect(enabled.parts.root.getProps().on?.click).toBeUndefined();
    enabled.destroy();

    const disabled = createCheckboxController({ defaultChecked: false, disabled: true });
    disabled.parts.root.getProps().on?.click?.({ type: 'click' });
    expect(disabled.state.checked).toBe(false);
    expect(disabled.state.lastError?.code).toBe('UIFN_ERR_DISABLED_INTERACTION');
    disabled.destroy();
  });

  it('TV-PRIM-004-N rejects implicit object form serialization with UIFN_FORM_VALUE_SERIALIZATION', () => {
    expect(() => createSelectController({
      items: [{ id: 'tokyo', value: { code: 13 }, label: 'Tokyo' }],
      defaultValue: 'tokyo',
      name: 'city',
    })).toThrowError(expect.objectContaining<Partial<UIFnError>>({ code: 'UIFN_FORM_VALUE_SERIALIZATION' }));
  });

  it('TV-PRIM-004-P keeps controlled state authoritative and rejects stale reconciliation', () => {
    const changes: unknown[] = [];
    const controller = createSelectController({
      items: ['alpha', 'beta'],
      value: 'alpha',
      syncSequence: 10,
      onValueChange: (value) => changes.push(value),
    });

    controller.actions.select('beta');
    expect(controller.state.value).toBe('alpha');
    expect(controller.state.requestedValue).toBe('beta');
    expect(changes).toEqual(['beta']);

    controller.actions.syncValue('beta', 0);
    expect(controller.state.value).toBe('alpha');
    expect(controller.state.lastErrorCode).toBe('UIFN_CONTROLLED_UPDATE_STALE');

    controller.actions.syncValue('beta', controller.state.pendingSequence);
    expect(controller.state.value).toBe('beta');
    expect(controller.state.requestedValue).toBeUndefined();
    controller.destroy();
  });

  it('TV-PRIM-004-P repairs dynamic collections, disabled state, required validity, and reset', () => {
    const controller = createListboxController({
      items: ['alpha', 'beta'],
      defaultValue: 'beta',
      required: true,
      nullable: false,
      name: 'choice',
    });
    controller.actions.setItems(['alpha']);
    expect(controller.state.value).toBe('alpha');
    expect(controller.state.valid).toBe(true);

    controller.actions.setFieldsetDisabled(true);
    controller.actions.select('alpha');
    expect(controller.state.lastErrorCode).toBe('UIFN_ERR_DISABLED_INTERACTION');
    expect(controller.actions.getFormValue()).toEqual({ choice: 'alpha' });

    controller.actions.setFieldsetDisabled(false);
    controller.actions.reset();
    expect(controller.state.value).toBe('alpha');
    controller.destroy();
  });

  it('TV-PRIM-005-P defers Japanese IME filtering and commits only at composition end', () => {
    const selectionChanges: string[] = [];
    const controller = createAutocompleteController({
      items: [{ value: 'tokyo', textValue: '東京', label: '東京' }],
      onInputValueChange: (value) => selectionChanges.push(value),
    });

    controller.actions.compositionStart();
    controller.actions.compositionUpdate('とう');
    expect(controller.state.composing).toBe(true);
    expect(controller.state.inputValue).toBe('');
    expect(controller.state.visibleItems).toEqual(['tokyo']);
    expect(selectionChanges).toEqual([]);

    controller.actions.compositionEnd('東京');
    expect(controller.state.composing).toBe(false);
    expect(controller.state.inputValue).toBe('東京');
    expect(selectionChanges).toEqual(['東京']);
    controller.destroy();
  });

  it('TV-PRIM-005-P preserves caret, paste, autofill, locale step, completion, and reset semantics', () => {
    const number = createNumberInputController({ defaultValue: '1,5', locale: 'de-DE', step: 0.5 });
    expect(number.state.numberValue).toBe(1.5);
    number.actions.increment();
    expect(number.state.numberValue).toBe(2);
    expect(number.actions.getInputValue()).toBe('2,0');
    number.actions.paste('3,5', { start: 0, end: 3 });
    expect(number.state.pasteCount).toBe(1);
    expect(number.state.caret).toMatchObject({ start: 3, end: 3 });
    number.actions.autofill('4,5');
    expect(number.state.autofilled).toBe(true);
    number.actions.reset();
    expect(number.state.autofilled).toBe(false);
    expect(number.state.numberValue).toBe(1.5);

    const pinComplete = vi.fn();
    const pin = createPinInputController({ length: 4, onComplete: pinComplete });
    pin.actions.compositionStart();
    pin.actions.compositionUpdate('１２');
    expect(pin.state.valueLength).toBe(0);
    pin.actions.compositionEnd('1234');
    expect(pin.state.completed).toBe(true);
    expect(pinComplete).toHaveBeenCalledWith('1234');
    pin.actions.clear();
    pin.parts.input.getProps(0).on?.input?.({ type: 'input', value: '1' });
    pin.parts.input.getProps(1).on?.input?.({ type: 'input', value: '2' });
    pin.parts.input.getProps(2).on?.input?.({ type: 'input', value: '3' });
    pin.parts.input.getProps(3).on?.input?.({ type: 'input', value: '4' });
    expect(pin.actions.getInputValue()).toBe('1234');
    pin.parts.input.getProps(2).on?.input?.({ type: 'input', value: '9' });
    expect(pin.actions.getInputValue()).toBe('1294');
    pin.parts.input.getProps(2).on?.input?.({ type: 'input', value: '' });
    expect(pin.actions.getInputValue()).toBe('124');
    number.destroy();
    pin.destroy();
  });

  it('TV-PRIM-005-N reports denied clipboard and rejected files without fake success', async () => {
    const clipboard = createClipboardController({
      capability: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
    });
    await expect(clipboard.actions.copy('public')).rejects.toMatchObject({ code: 'UIFN_CLIPBOARD_DENIED' });
    expect(clipboard.state.status).toBe('error');
    expect(clipboard.state.operationCount).toBe(0);

    const rejected: string[] = [];
    const files = createFileUploadController({
      accept: 'image/*',
      maxSize: 100,
      required: true,
      onReject: (code) => rejected.push(code),
    });
    expect(files.parts.input.getProps().attributes?.required).toBe(true);
    files.actions.selectFiles([{ name: 'notes.txt', size: 10, type: 'text/plain' }]);
    expect(files.state.status).toBe('rejected');
    expect(files.state.fileCount).toBe(0);
    expect(files.state.lastErrorCode).toBe('UIFN_FILE_REJECTED');
    expect(rejected).toEqual(['type']);
    files.actions.selectFiles([{ name: 'photo.png', size: 10, type: 'image/png' }]);
    expect(files.state.valid).toBe(true);
    expect(files.parts.input.getProps().attributes?.required).toBe(false);
    clipboard.destroy();
    files.destroy();
  });

  it('TV-PRIM-005-N redacts password, pin, and file payloads from state and snapshots', () => {
    const secret = 'correct horse battery staple';
    const password = createPasswordInputController({ defaultValue: secret });
    const pin = createPinInputController({ defaultValue: '9876', length: 4 });
    const files = createFileUploadController();
    files.actions.selectFiles([{ name: 'private-tax-return.pdf', size: 42, type: 'application/pdf', native: { bytes: 'classified' } }]);

    const evidence = JSON.stringify({
      password: password.snapshot,
      pin: pin.snapshot,
      files: files.snapshot,
    });
    expect(evidence).not.toContain(secret);
    expect(evidence).not.toContain('9876');
    expect(evidence).not.toContain('private-tax-return.pdf');
    expect(evidence).not.toContain('classified');
    expect(password.actions.getInputValue()).toBe(secret);
    expect(pin.actions.getInputValue()).toBe('9876');
    password.destroy();
    pin.destroy();
    files.destroy();
  });
});
