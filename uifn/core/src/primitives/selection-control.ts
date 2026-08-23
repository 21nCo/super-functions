import {
  createListCollection,
  createLocaleMatcher,
  getNextCollectionKey,
  reconcileCollectionKey,
} from '../algorithms';
import { createUIFnController, type UIFnController, type UIFnInputModality } from '../controller';
import { createUIFnError } from '../errors';
import {
  createUIFnEnvironment,
  createUIFnIdAllocator,
  normalizeUIFnIdToken,
  type UIFnEnvironment,
} from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartEvent, type UIFnPartProps } from '../parts';

export type UIFnSelectionKey = string;
export type UIFnSelectionValue = UIFnSelectionKey | readonly UIFnSelectionKey[] | null;
export type UIFnSelectionMode = 'single' | 'multiple';

export interface UIFnSelectionItem<TValue = unknown> {
  readonly id?: string;
  readonly value?: TValue;
  readonly label?: string;
  readonly textValue?: string;
  readonly disabled?: boolean;
  readonly serializedValue?: string;
  readonly group?: string;
}

export type UIFnSelectionItemInput = string | number | UIFnSelectionItem;

export interface UIFnSelectionItemAdapter<TItem> {
  getKey(item: TItem): string | number;
  getTextValue(item: TItem): string;
  isDisabled?(item: TItem): boolean;
  serialize?(item: TItem): string;
  getGroup?(item: TItem): string | undefined;
}

export interface UIFnNormalizedSelectionItem {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly textValue: string;
  readonly disabled: boolean;
  readonly serializedValue: string;
  readonly group?: string;
}

export interface UIFnSelectionInputs<TItem = UIFnSelectionItemInput> {
  readonly items?: readonly TItem[];
  readonly itemAdapter?: UIFnSelectionItemAdapter<TItem>;
  readonly value?: UIFnSelectionValue;
  readonly defaultValue?: UIFnSelectionValue;
  readonly multiple?: boolean;
  readonly nullable?: boolean;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly name?: string;
  readonly form?: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly direction?: 'ltr' | 'rtl';
  readonly locale?: string;
  readonly loop?: boolean;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly inputValue?: string;
  readonly defaultInputValue?: string;
  readonly placeholder?: string;
  readonly descriptionId?: string;
  readonly errorId?: string;
  readonly validityMessage?: string;
  readonly syncSequence?: number;
  readonly checked?: boolean | 'indeterminate';
  readonly defaultChecked?: boolean | 'indeterminate';
  readonly pressed?: boolean;
  readonly defaultPressed?: boolean;
  readonly onValueChange?: (value: UIFnSelectionValue) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onInputValueChange?: (value: string) => void;
  readonly onAnnouncement?: (message: string) => void;
  readonly onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  readonly onPressedChange?: (pressed: boolean) => void;
}

export interface UIFnSelectionIds {
  readonly rootId: string;
  readonly ids: Readonly<Record<string, string>>;
  item(part: string, key: string): string;
}

export interface UIFnSelectionState {
  readonly primitive: string;
  readonly mode: UIFnSelectionMode;
  readonly controlled: boolean;
  readonly openControlled: boolean;
  readonly inputControlled: boolean;
  readonly value: UIFnSelectionValue;
  readonly selectedKeys: readonly string[];
  readonly checked: boolean | 'indeterminate';
  readonly pressed: boolean;
  readonly indeterminate: boolean;
  readonly requestedValue: UIFnSelectionValue | undefined;
  readonly pendingSequence: number;
  readonly settledSequence: number;
  readonly staleSyncCount: number;
  readonly items: readonly UIFnNormalizedSelectionItem[];
  readonly options: readonly UIFnNormalizedSelectionItem[];
  readonly visibleItems: readonly string[];
  readonly groups: readonly { readonly label: string }[];
  readonly focusedItem: string | null;
  readonly highlightedItem: string | null;
  readonly open: boolean;
  readonly inputValue: string;
  readonly placeholder?: string;
  readonly draftValue: string;
  readonly composing: boolean;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly name?: string;
  readonly form?: string;
  readonly orientation: 'horizontal' | 'vertical';
  readonly direction: 'ltr' | 'rtl';
  readonly locale: string;
  readonly valid: boolean;
  readonly invalid: boolean;
  readonly validityMessage: string;
  readonly formValues: readonly string[];
  readonly formValue: Readonly<Record<string, string | readonly string[]>>;
  readonly announcement: string | null;
  readonly emptyStateShown: boolean;
  readonly ids: Readonly<Record<string, string>>;
  readonly lastErrorCode: string | null;
  readonly lastError: Readonly<{ code: string; recoverable: boolean }> | null;
}

export interface UIFnSelectionActions<TItem = UIFnSelectionItemInput> {
  select(key: string, modality?: UIFnInputModality): void;
  toggle(key?: string, modality?: UIFnInputModality): void;
  toggleItem(key: string, modality?: UIFnInputModality): void;
  setChecked(checked: boolean | 'indeterminate'): void;
  syncChecked(checked: boolean | 'indeterminate'): void;
  setPressed(pressed: boolean): void;
  syncPressed(pressed: boolean): void;
  clear(modality?: UIFnInputModality): void;
  focusItem(key: string | null): void;
  highlightItem(key: string | null): void;
  handleKeyDown(key: string, currentKey?: string | null): string | null;
  setItems(items: readonly TItem[]): void;
  setOptions(items: readonly TItem[]): void;
  registerItem(item: TItem): () => void;
  registerOption(item: TItem): () => void;
  unregisterItem(key: string): void;
  unregisterOption(key: string): void;
  addValue(value: string): void;
  removeValue(value: string): void;
  paste(value: string): void;
  setItemDisabled(key: string, disabled: boolean): void;
  setValue(value: UIFnSelectionValue): void;
  syncValue(value: UIFnSelectionValue, sequence?: number): void;
  setOpen(open: boolean): void;
  syncOpen(open: boolean): void;
  setInputValue(value: string, caret?: { start: number | null; end: number | null }): void;
  syncInputValue(value: string, sequence?: number): void;
  compositionStart(): void;
  compositionUpdate(value: string): void;
  compositionEnd(value: string): void;
  reset(): void;
  setFieldsetDisabled(disabled: boolean): void;
  getFormValues(): readonly string[];
  getFormValue(): Readonly<Record<string, string | readonly string[]>>;
  getHiddenInput(): Readonly<{ name: string; value: string; disabled: boolean; required: boolean; form?: string }> | null;
}

export interface UIFnSelectionPart {
  readonly name: string;
  getProps(itemOrProps?: string | UIFnPartProps, userProps?: UIFnPartProps): UIFnPartProps;
}

export interface UIFnSelectionPrimitiveConfig {
  readonly primitive: string;
  readonly slug: string;
  readonly anatomy: readonly string[];
  readonly mode?: UIFnSelectionMode;
  readonly editable?: boolean;
  readonly itemPart?: string;
  readonly rootRole?: string;
  readonly itemRole?: 'option' | 'radio' | 'checkbox' | 'button';
  readonly inputRole?: 'combobox' | 'textbox';
  readonly contentRole?: 'listbox' | 'group';
  readonly contentPart?: string;
  readonly selectionAria?: 'selected' | 'checked' | 'pressed';
  readonly activation?: 'select' | 'toggle';
  readonly booleanAlias?: 'checked' | 'pressed';
  readonly closeOnSelect?: boolean;
  readonly triggerRole?: 'button' | 'combobox';
  readonly inputCommitKeys?: readonly string[];
}

export type UIFnSelectionController<TItem = UIFnSelectionItemInput> = UIFnController<
  UIFnSelectionState,
  UIFnSelectionActions<TItem>,
  Readonly<Record<string, UIFnSelectionPart>>,
  UIFnSelectionInputs<TItem>
>;

function failSerialization(details: Record<string, unknown>): never {
  throw createUIFnError({
    code: 'UIFN_FORM_VALUE_SERIALIZATION',
    component: 'Selection',
    details,
  });
}

function primitiveSerializedValue(value: unknown, key: string): string {
  if (value === undefined) return key;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return failSerialization({ key, valueType: value === null ? 'null' : typeof value });
}

export function normalizeUIFnSelectionItems<TItem>(
  items: readonly TItem[],
  adapter?: UIFnSelectionItemAdapter<TItem>,
): readonly UIFnNormalizedSelectionItem[] {
  const normalized = items.map((item, index): UIFnNormalizedSelectionItem => {
    if (adapter) {
      const key = String(adapter.getKey(item));
      if (!key) return failSerialization({ reason: 'empty-key', index });
      const serialized = adapter.serialize?.(item);
      if (serialized === undefined) return failSerialization({ reason: 'object-adapter-missing-serialize', key, index });
      return Object.freeze({
        id: key,
        value: key,
        label: adapter.getTextValue(item),
        textValue: adapter.getTextValue(item),
        disabled: adapter.isDisabled?.(item) ?? false,
        serializedValue: serialized,
        group: adapter.getGroup?.(item),
      });
    }
    if (typeof item === 'string' || typeof item === 'number') {
      const key = String(item);
      return Object.freeze({ id: key, value: key, label: key, textValue: key, disabled: false, serializedValue: key });
    }
    if (!item || typeof item !== 'object') return failSerialization({ reason: 'invalid-item', index });
    const candidate = item as UIFnSelectionItem;
    const primitiveValue = typeof candidate.value === 'string' || typeof candidate.value === 'number'
      ? String(candidate.value)
      : undefined;
    const key = String(candidate.id ?? primitiveValue ?? '');
    if (!key) return failSerialization({ reason: 'empty-key', index });
    return Object.freeze({
      id: key,
      value: key,
      label: candidate.label ?? candidate.textValue ?? key,
      textValue: candidate.textValue ?? candidate.label ?? key,
      disabled: candidate.disabled ?? false,
      serializedValue: candidate.serializedValue ?? primitiveSerializedValue(candidate.value, key),
      group: candidate.group,
    });
  });
  createListCollection({
    items: normalized,
    getKey: (item) => item.id,
    getTextValue: (item) => item.textValue,
    isDisabled: (item) => item.disabled,
  });
  return Object.freeze(normalized);
}

function normalizeSelectionValue(value: UIFnSelectionValue | undefined, mode: UIFnSelectionMode): readonly string[] {
  const keys = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
  const unique = [...new Set(keys.map(String))];
  return Object.freeze(mode === 'single' ? unique.slice(0, 1) : unique);
}

function selectionValue(keys: readonly string[], mode: UIFnSelectionMode): UIFnSelectionValue {
  return mode === 'multiple' ? Object.freeze([...keys]) : keys[0] ?? null;
}

function equalKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

function createIds(config: UIFnSelectionPrimitiveConfig, env: UIFnEnvironment): UIFnSelectionIds {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, config.primitive);
  const token = resolved.generateId(config.slug);
  const ids = Object.fromEntries(config.anatomy.map((part) => [
    part,
    allocator.fromToken(`${config.slug}-${part}`, token, part),
  ]));
  const rootId = ids.root ?? allocator.fromToken(`${config.slug}-root`, token, 'root');
  ids.baseId = rootId;
  return Object.freeze({
    rootId,
    ids: Object.freeze(ids),
    item(part: string, key: string) {
      return `${rootId}-${part}-${normalizeUIFnIdToken(key) || 'item'}`;
    },
  });
}

function eventValue(event?: UIFnPartEvent): string {
  if (typeof event?.value === 'string') return event.value;
  const target = event?.currentTarget as { value?: unknown } | null | undefined;
  return typeof target?.value === 'string' ? target.value : '';
}

function itemArgument(
  itemOrProps?: string | UIFnPartProps,
  userProps?: UIFnPartProps,
): { key: string | null; userProps?: UIFnPartProps } {
  return typeof itemOrProps === 'string'
    ? { key: itemOrProps, userProps }
    : { key: null, userProps: itemOrProps };
}

export function createUIFnSelectionPrimitiveController<TItem = UIFnSelectionItemInput>(
  config: UIFnSelectionPrimitiveConfig,
  inputs: UIFnSelectionInputs<TItem> = {},
  env: UIFnEnvironment = {},
): UIFnSelectionController<TItem> {
  const contentPart = config.contentPart ?? 'content';
  const mode = config.mode ?? (inputs.multiple ? 'multiple' : 'single');
  const controlled = inputs.value !== undefined
    || (config.booleanAlias === 'checked' && inputs.checked !== undefined)
    || (config.booleanAlias === 'pressed' && inputs.pressed !== undefined);
  const openControlled = inputs.open !== undefined;
  const inputControlled = inputs.inputValue !== undefined;
  const aliasDefault = config.booleanAlias === 'checked'
    ? (inputs.defaultChecked === true || inputs.defaultChecked === 'indeterminate' ? 'on' : null)
    : config.booleanAlias === 'pressed' ? (inputs.defaultPressed ? 'on' : null) : inputs.defaultValue;
  const defaultKeys = normalizeSelectionValue(aliasDefault, mode);
  const ids = createIds(config, env);
  let adapter = inputs.itemAdapter;
  let items = normalizeUIFnSelectionItems(inputs.items ?? [], adapter);
  const registrationCounts = new Map<string, number>();
  const dynamicallyRegistered = new Set<string>();
  const aliasValue = config.booleanAlias === 'checked'
    ? (inputs.checked !== undefined ? (inputs.checked === true || inputs.checked === 'indeterminate' ? 'on' : null) : aliasDefault)
    : config.booleanAlias === 'pressed'
      ? (inputs.pressed !== undefined ? (inputs.pressed ? 'on' : null) : aliasDefault)
      : controlled ? inputs.value : inputs.defaultValue;
  let initialKeys = normalizeSelectionValue(aliasValue, mode);
  const enabledKeys = () => items.filter((item) => !item.disabled).map((item) => item.id);
  if (!controlled) initialKeys = Object.freeze(initialKeys.filter((key) => items.some((item) => item.id === key && !item.disabled)));
  if (!inputs.nullable && initialKeys.length === 0 && enabledKeys().length > 0) initialKeys = Object.freeze([enabledKeys()[0]!]);
  const materialize = (
    base: Omit<UIFnSelectionState, 'value' | 'checked' | 'pressed' | 'items' | 'formValues' | 'formValue' | 'valid' | 'invalid' | 'emptyStateShown' | 'visibleItems' | 'groups' | 'options'>
      & Partial<Pick<UIFnSelectionState, 'value' | 'formValues' | 'formValue' | 'valid' | 'invalid' | 'emptyStateShown' | 'visibleItems' | 'groups' | 'options'>>,
  ): UIFnSelectionState => {
    const selectedKeys = Object.freeze([...base.selectedKeys]);
    const selected = selectedKeys.map((key) => items.find((item) => item.id === key)).filter(Boolean) as UIFnNormalizedSelectionItem[];
    const formValues = Object.freeze(selected.map((item) => item.serializedValue));
    if (formValues.some((value) => value === '[object Object]')) failSerialization({ reason: 'implicit-object-string' });
    const query = base.inputValue;
    const visible = config.editable && query
      ? items.filter((item) => createLocaleMatcher(base.locale).includes(item.textValue, query)).map((item) => item.id)
      : items.map((item) => item.id);
    const valid = !base.required || selectedKeys.length > 0;
    const value = selectionValue(selectedKeys, mode);
    return Object.freeze({
      ...base,
      value,
      checked: config.booleanAlias === 'checked' && base.indeterminate ? 'indeterminate' : selectedKeys.length > 0,
      pressed: selectedKeys.length > 0,
      selectedKeys,
      items,
      options: items,
      visibleItems: Object.freeze(visible),
      groups: Object.freeze([...new Set(items.map((item) => item.group).filter(Boolean) as string[])].map((label) => Object.freeze({ label }))),
      valid,
      invalid: !valid,
      validityMessage: valid ? '' : (inputs.validityMessage ?? 'A value is required.'),
      formValues,
      formValue: Object.freeze(base.name
        ? { [base.name]: mode === 'multiple' ? formValues : formValues[0] ?? '' }
        : {}),
      emptyStateShown: visible.length === 0,
    });
  };

  const initialInputValue = inputControlled ? inputs.inputValue! : inputs.defaultInputValue ?? '';
  const store = createStateChannel<UIFnSelectionState, UIFnSelectionValue>(materialize({
    primitive: config.primitive,
    mode,
    controlled,
    openControlled,
    inputControlled,
    selectedKeys: initialKeys,
    indeterminate: config.booleanAlias === 'checked' && (inputs.checked ?? inputs.defaultChecked) === 'indeterminate',
    requestedValue: undefined,
    pendingSequence: 0,
    settledSequence: inputs.syncSequence ?? 0,
    staleSyncCount: 0,
    focusedItem: reconcileCollectionKey(createListCollection({ items, getKey: (item) => item.id, isDisabled: (item) => item.disabled }), { previousKey: initialKeys[0] ?? null }),
    highlightedItem: initialKeys[0] ?? null,
    open: openControlled ? inputs.open! : inputs.defaultOpen ?? false,
    inputValue: initialInputValue,
    placeholder: inputs.placeholder,
    draftValue: initialInputValue,
    composing: false,
    disabled: inputs.disabled ?? false,
    readOnly: inputs.readOnly ?? false,
    required: inputs.required ?? false,
    nullable: inputs.nullable ?? true,
    name: inputs.name,
    form: inputs.form,
    orientation: inputs.orientation ?? 'vertical',
    direction: inputs.direction ?? 'ltr',
    locale: inputs.locale ?? 'en',
    validityMessage: inputs.validityMessage ?? 'A value is required.',
    announcement: null,
    ids: ids.ids,
    lastErrorCode: null,
    lastError: null,
  }));

  const patch = (partial: Partial<UIFnSelectionState>) => {
    const current = store.getState();
    store.setState(materialize({ ...current, ...partial }));
  };

  const ensureInteractive = (): boolean => {
    const state = store.getState();
    if (!state.disabled && !state.readOnly) return true;
    patch({
      lastErrorCode: state.disabled ? 'UIFN_ERR_DISABLED_INTERACTION' : null,
      lastError: state.disabled ? Object.freeze({ code: 'UIFN_ERR_DISABLED_INTERACTION', recoverable: true }) : null,
    });
    return false;
  };

  const validKeys = (keys: readonly string[]) => Object.freeze(keys.filter((key) => items.some((item) => item.id === key && !item.disabled)));

  const requestSelection = (
    requestedKeys: readonly string[],
    reason: string,
    modality?: UIFnInputModality,
    committedInput?: string,
  ) => {
    if (!ensureInteractive()) return false;
    const state = store.getState();
    let nextKeys = validKeys(mode === 'single' ? requestedKeys.slice(0, 1) : requestedKeys);
    if (!state.nullable && nextKeys.length === 0) return false;
    const selectionChanged = !equalKeys(state.selectedKeys, nextKeys);
    const inputChanged = committedInput !== undefined
      && (inputControlled ? state.draftValue !== committedInput : state.inputValue !== committedInput);
    if (!selectionChanged && !inputChanged) return false;
    const nextValue = selectionValue(nextKeys, mode);
    const partial: { -readonly [Key in keyof UIFnSelectionState]?: UIFnSelectionState[Key] } = {
      announcement: `${reason}:${nextKeys.length}`,
      lastErrorCode: null,
      lastError: null,
    };
    let pendingSequence = state.pendingSequence;
    if (selectionChanged) {
      if (controlled) {
        pendingSequence += 1;
        partial.requestedValue = nextValue;
        partial.pendingSequence = pendingSequence;
      } else {
        partial.selectedKeys = nextKeys;
        partial.requestedValue = undefined;
      }
    }
    if (committedInput !== undefined) {
      if (inputControlled) {
        pendingSequence = Math.max(pendingSequence, state.pendingSequence + 1);
        partial.draftValue = committedInput;
        partial.pendingSequence = pendingSequence;
      } else {
        partial.inputValue = committedInput;
        partial.draftValue = committedInput;
      }
    }
    patch(partial);
    if (selectionChanged) inputs.onValueChange?.(nextValue);
    if (selectionChanged && config.booleanAlias === 'checked') inputs.onCheckedChange?.(
      store.getState().indeterminate && nextKeys.length > 0 ? 'indeterminate' : nextKeys.length > 0,
    );
    if (selectionChanged && config.booleanAlias === 'pressed') inputs.onPressedChange?.(nextKeys.length > 0);
    if (selectionChanged) inputs.onAnnouncement?.(`${reason}:${nextKeys.length}`);
    if (committedInput !== undefined) inputs.onInputValueChange?.(committedInput);
    void modality;
    return true;
  };

  const syncSelection = (value: UIFnSelectionValue, sequence = store.getState().pendingSequence) => {
    const state = store.getState();
    if (sequence < state.pendingSequence) {
      patch({ staleSyncCount: state.staleSyncCount + 1, lastErrorCode: 'UIFN_CONTROLLED_UPDATE_STALE' });
      return;
    }
    const nextKeys = controlled ? normalizeSelectionValue(value, mode) : validKeys(normalizeSelectionValue(value, mode));
    patch({
      selectedKeys: nextKeys,
      requestedValue: undefined,
      settledSequence: sequence,
      lastErrorCode: null,
      lastError: null,
    });
  };

  const setOpen = (next: boolean, sync = false) => {
    const state = store.getState();
    if (state.open === next) return;
    if (openControlled && !sync) inputs.onOpenChange?.(next);
    else patch({ open: next });
    if (!sync && !openControlled) inputs.onOpenChange?.(next);
  };

  const commitInput = (next: string, sync = false, sequence = store.getState().pendingSequence) => {
    const state = store.getState();
    if (sync && sequence < state.pendingSequence) {
      patch({ staleSyncCount: state.staleSyncCount + 1, lastErrorCode: 'UIFN_CONTROLLED_UPDATE_STALE' });
      return;
    }
    if (inputControlled && !sync) {
      patch({ draftValue: next, pendingSequence: state.pendingSequence + 1 });
      inputs.onInputValueChange?.(next);
      return;
    }
    patch({ inputValue: next, draftValue: next, settledSequence: sync ? sequence : state.settledSequence, lastErrorCode: null });
    if (!sync) inputs.onInputValueChange?.(next);
  };

  const collection = () => createListCollection({
    items: items.filter((item) => store.getState().visibleItems.includes(item.id)),
    getKey: (item) => item.id,
    getTextValue: (item) => item.textValue,
    isDisabled: (item) => item.disabled,
  });

  const actions: UIFnSelectionActions<TItem> = {
    select(key, modality) {
      const committedInput = config.editable && mode === 'single'
        ? items.find((item) => item.id === key)?.textValue
        : undefined;
      requestSelection(
        mode === 'multiple' ? [...store.getState().selectedKeys, key] : [key],
        'select',
        modality,
        committedInput,
      );
    },
    toggle(key = 'on', modality) {
      const selected = store.getState().selectedKeys;
      requestSelection(
        selected.includes(key)
          ? selected.filter((value) => value !== key)
          : mode === 'single' ? [key] : [...selected, key],
        'toggle',
        modality,
      );
      if (config.booleanAlias === 'checked') patch({ indeterminate: false });
    },
    toggleItem(key, modality) {
      this.toggle(key, modality);
    },
    setChecked(checked) {
      patch({ indeterminate: checked === 'indeterminate' });
      requestSelection(checked === false ? [] : ['on'], 'set-checked');
    },
    syncChecked(checked) {
      patch({ indeterminate: checked === 'indeterminate' });
      syncSelection(checked === false ? null : 'on');
    },
    setPressed(pressed) {
      requestSelection(pressed ? ['on'] : [], 'set-pressed');
    },
    syncPressed(pressed) {
      syncSelection(pressed ? 'on' : null);
    },
    clear(modality) {
      requestSelection([], 'clear', modality);
      if (config.editable) commitInput('');
    },
    focusItem(key) {
      const next = key === null ? null : collection().enabledKeys.includes(key) ? key : store.getState().focusedItem;
      patch({ focusedItem: next, highlightedItem: next });
    },
    highlightItem(key) {
      this.focusItem(key);
    },
    handleKeyDown(key, currentKey = store.getState().focusedItem) {
      const state = store.getState();
      if (state.composing) return currentKey ?? null;
      if (key === 'Enter' || key === ' ') {
        if (currentKey) {
          (config.activation ?? (mode === 'multiple' ? 'toggle' : 'select')) === 'toggle'
            ? this.toggle(currentKey, 'keyboard')
            : this.select(currentKey, 'keyboard');
          if (config.closeOnSelect && mode === 'single') setOpen(false);
        }
        return currentKey ?? null;
      }
      if (key === 'Escape') {
        setOpen(false);
        return currentKey ?? null;
      }
      const next = getNextCollectionKey({
        collection: collection(),
        key,
        currentKey: currentKey ?? null,
        orientation: state.orientation,
        direction: state.direction,
        loop: inputs.loop ?? true,
      });
      if (next !== currentKey) patch({ focusedItem: next, highlightedItem: next });
      return next;
    },
    setItems(nextItems) {
      const state = store.getState();
      const previous = items;
      const previousIndex = state.focusedItem === null ? 0 : Math.max(0, previous.findIndex((item) => item.id === state.focusedItem));
      items = normalizeUIFnSelectionItems(nextItems, adapter);
      const repairedFocus = reconcileCollectionKey(createListCollection({ items, getKey: (item) => item.id, isDisabled: (item) => item.disabled }), {
        previousKey: state.focusedItem,
        previousIndex,
      });
      let repaired = validKeys(state.selectedKeys);
      if (!state.nullable && repaired.length === 0 && enabledKeys().length > 0) repaired = Object.freeze([enabledKeys()[0]!]);
      if (controlled && !equalKeys(repaired, state.selectedKeys)) {
        const requested = selectionValue(repaired, mode);
        patch({ focusedItem: repairedFocus, highlightedItem: repairedFocus, requestedValue: requested, pendingSequence: state.pendingSequence + 1 });
        inputs.onValueChange?.(requested);
      } else {
        patch({ selectedKeys: repaired, focusedItem: repairedFocus, highlightedItem: repairedFocus });
      }
    },
    setOptions(nextItems) {
      this.setItems(nextItems);
    },
    registerItem(item) {
      const normalized = normalizeUIFnSelectionItems([item], adapter)[0]!;
      const key = normalized.id;
      registrationCounts.set(key, (registrationCounts.get(key) ?? 0) + 1);
      if (!items.some((entry) => entry.id === key)) {
        dynamicallyRegistered.add(key);
        const normalizedAdapter = adapter;
        adapter = undefined;
        this.setItems([...items, normalized] as unknown as readonly TItem[]);
        adapter = normalizedAdapter;
      }
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        const remaining = Math.max(0, (registrationCounts.get(key) ?? 1) - 1);
        if (remaining > 0) {
          registrationCounts.set(key, remaining);
          return;
        }
        registrationCounts.delete(key);
        if (!dynamicallyRegistered.delete(key)) return;
        const normalizedAdapter = adapter;
        adapter = undefined;
        this.setItems(items.filter((entry) => entry.id !== key) as unknown as readonly TItem[]);
        adapter = normalizedAdapter;
      };
    },
    registerOption(item) {
      return this.registerItem(item);
    },
    unregisterItem(key) {
      registrationCounts.delete(key);
      dynamicallyRegistered.delete(key);
      const retained = items.filter((item) => item.id !== key) as unknown as readonly TItem[];
      const normalizedAdapter = adapter;
      adapter = undefined;
      this.setItems(retained);
      adapter = normalizedAdapter;
    },
    unregisterOption(key) {
      this.unregisterItem(key);
    },
    addValue(value) {
      const key = value.trim();
      if (!key || items.some((item) => item.id === key)) return;
      const normalizedAdapter = adapter;
      adapter = undefined;
      this.setItems([...items, { id: key, value: key, label: key, textValue: key, disabled: false, serializedValue: key }] as unknown as readonly TItem[]);
      adapter = normalizedAdapter;
      requestSelection([...store.getState().selectedKeys, key], 'add-value');
      commitInput('');
    },
    removeValue(value) {
      requestSelection(store.getState().selectedKeys.filter((key) => key !== value), 'remove-value');
      this.unregisterItem(value);
    },
    paste(value) {
      if (store.getState().composing) {
        patch({ draftValue: value });
        return;
      }
      for (const token of value.split(/[\n,]+/).map((entry) => entry.trim()).filter(Boolean)) this.addValue(token);
    },
    setItemDisabled(key, disabled) {
      const retained = items.map((item) => item.id === key ? { ...item, disabled } : item) as unknown as readonly TItem[];
      const normalizedAdapter = adapter;
      adapter = undefined;
      this.setItems(retained);
      adapter = normalizedAdapter;
    },
    setValue(value) {
      requestSelection(normalizeSelectionValue(value, mode), 'set-value');
    },
    syncValue(value, sequence) {
      syncSelection(value, sequence);
    },
    setOpen(open) {
      setOpen(open);
    },
    syncOpen(open) {
      setOpen(open, true);
    },
    setInputValue(value) {
      if (!ensureInteractive()) return;
      if (store.getState().composing) patch({ draftValue: value });
      else commitInput(value);
      setOpen(true);
    },
    syncInputValue(value, sequence) {
      commitInput(value, true, sequence);
    },
    compositionStart() {
      if (!ensureInteractive()) return;
      patch({ composing: true, draftValue: store.getState().inputValue });
    },
    compositionUpdate(value) {
      if (!store.getState().composing) {
        throw createUIFnError({ code: 'UIFN_IME_COMMIT_EARLY', component: config.primitive });
      }
      patch({ draftValue: value });
    },
    compositionEnd(value) {
      if (!store.getState().composing) return;
      patch({ composing: false });
      commitInput(value);
      setOpen(true);
    },
    reset() {
      const state = store.getState();
      let resetKeys = validKeys(defaultKeys);
      if (!state.nullable && resetKeys.length === 0 && enabledKeys().length > 0) {
        resetKeys = Object.freeze([enabledKeys()[0]!]);
      }
      if (controlled) {
        const requested = selectionValue(resetKeys, mode);
        patch({ requestedValue: requested, pendingSequence: state.pendingSequence + 1 });
        inputs.onValueChange?.(requested);
      } else {
        patch({ selectedKeys: resetKeys, requestedValue: undefined });
      }
      if (!inputControlled) patch({ inputValue: inputs.defaultInputValue ?? '', draftValue: inputs.defaultInputValue ?? '', composing: false });
      setOpen(false, !openControlled);
    },
    setFieldsetDisabled(disabled) {
      patch({ disabled });
    },
    getFormValues() {
      return store.getState().formValues;
    },
    getFormValue() {
      return store.getState().formValue;
    },
    getHiddenInput() {
      const state = store.getState();
      return state.name ? Object.freeze({ name: state.name, value: state.formValues[0] ?? '', disabled: state.disabled, required: state.required, form: state.form }) : null;
    },
  };

  const generatedFor = (part: string, key: string | null): UIFnPartProps => {
    const state = store.getState();
    const item = key ? state.items.find((entry) => entry.id === key) : undefined;
    const selected = key ? state.selectedKeys.includes(key) : false;
    const itemId = key ? ids.item(part, key) : ids.ids[part] ?? `${ids.rootId}-${part}`;
    const describedby = [inputs.descriptionId, state.invalid ? (inputs.errorId ?? ids.ids.error) : undefined].filter(Boolean).join(' ') || undefined;
    const dataState = config.booleanAlias === 'checked'
      ? state.indeterminate ? 'indeterminate' : selected ? 'checked' : 'unchecked'
      : config.booleanAlias === 'pressed' ? selected ? 'on' : 'off'
        : selected ? 'checked' : state.open ? 'open' : 'idle';
    const common: UIFnPartProps = {
      id: itemId,
      data: {
        state: dataState,
        disabled: state.disabled || (item?.disabled ?? false),
        readonly: state.readOnly,
        invalid: state.invalid,
        value: key ?? undefined,
      },
    };
    if (part === 'root') return {
      ...common,
      role: config.rootRole,
      tabIndex: config.itemPart === 'root' ? (state.disabled ? -1 : 0) : undefined,
      disabled: config.itemPart === 'root' ? state.disabled : undefined,
      attributes: config.itemPart === 'root' ? { type: 'button' } : undefined,
      aria: config.rootRole || config.itemPart === 'root' ? {
        labelledby: ids.ids.label,
        describedby,
        disabled: state.disabled,
        required: config.rootRole === 'radiogroup' ? state.required : undefined,
        invalid: state.invalid,
        pressed: config.itemPart === 'root' ? state.pressed : undefined,
      } : undefined,
      on: config.itemPart === 'root'
        ? { click: () => actions.toggle('on', 'pointer'), keydown: (event) => actions.handleKeyDown(event?.key ?? '', 'on') }
        : config.primitive === 'Checkbox' && (state.disabled || state.readOnly)
          ? { click: () => actions.toggle('on', 'pointer') }
          : undefined,
    };
    if (part === 'label') return common;
    if (part === 'control' && config.itemPart !== 'control') return common;
    if (part === 'input') return {
      ...common,
      role: config.inputRole,
      tabIndex: state.disabled ? -1 : 0,
      disabled: state.disabled,
      aria: {
        labelledby: ids.ids.label,
        describedby,
        expanded: config.inputRole === 'combobox' ? state.open : undefined,
        controls: config.inputRole === 'combobox' ? ids.ids[contentPart] : undefined,
        activedescendant: config.inputRole === 'combobox' && state.highlightedItem ? ids.item(config.itemPart ?? 'item', state.highlightedItem) : undefined,
        autocomplete: config.inputRole === 'combobox' ? 'list' : undefined,
        invalid: state.invalid,
        required: state.required,
      },
      attributes: {
        value: state.composing ? state.draftValue : state.inputValue,
        placeholder: state.placeholder,
        autocomplete: 'off',
        readonly: state.readOnly,
      },
      on: {
        input: (event) => actions.setInputValue(eventValue(event)),
        keydown: (event) => {
          const key = event?.key ?? '';
          if (
            config.inputCommitKeys?.includes(key)
            && store.getState().inputValue.trim().length > 0
          ) {
            event?.preventDefault?.();
            actions.addValue(store.getState().inputValue);
            return;
          }
          if (
            config.inputCommitKeys
            && key === 'Backspace'
            && store.getState().inputValue.length === 0
          ) {
            const lastValue = store.getState().selectedKeys.at(-1);
            if (lastValue) actions.removeValue(lastValue);
            return;
          }
          actions.handleKeyDown(key);
        },
        compositionstart: () => actions.compositionStart(),
        compositionupdate: (event) => actions.compositionUpdate(event?.data ?? eventValue(event)),
        compositionend: (event) => actions.compositionEnd(event?.data ?? eventValue(event)),
      },
    };
    if (part === 'trigger') return {
      ...common,
      data: { ...common.data, state: state.open ? 'open' : 'closed' },
      role: config.triggerRole ?? 'button',
      tabIndex: state.disabled ? -1 : 0,
      disabled: state.disabled,
      attributes: { type: 'button' },
      aria: {
        labelledby: config.primitive === 'Select' ? ids.ids.label : undefined,
        expanded: state.open,
        controls: ids.ids[contentPart],
        disabled: state.disabled,
        activedescendant: config.triggerRole === 'combobox' && state.open && state.highlightedItem
          ? ids.item(config.itemPart ?? 'item', state.highlightedItem)
          : undefined,
      },
      on: {
        click: () => actions.setOpen(!store.getState().open),
        keydown: (event) => {
          const key = event?.key ?? '';
          const current = store.getState();
          if (key === 'Escape') {
            if (current.open) {
              event?.preventDefault?.();
              actions.setOpen(false);
            }
            return;
          }
          if (key === 'Tab') {
            if (current.open) actions.setOpen(false);
            return;
          }
          if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
            event?.preventDefault?.();
            if (!current.open) actions.setOpen(true);
            actions.handleKeyDown(key, current.highlightedItem);
            return;
          }
          if (current.open && (key === 'Enter' || key === ' ')) {
            event?.preventDefault?.();
            actions.handleKeyDown(key, current.highlightedItem);
          }
        },
      },
    };
    if (part === 'clear') return { ...common, role: 'button', disabled: state.disabled || state.readOnly, attributes: { type: 'button' }, aria: { label: 'Clear' }, on: { click: () => actions.clear('pointer') } };
    if (part === contentPart) return {
      ...common,
      role: config.contentRole,
      hidden: !state.open && config.primitive !== 'Listbox' && config.primitive !== 'Command',
      aria: { labelledby: ids.ids.label, multiselectable: mode === 'multiple' },
    };
    if (part === 'group') return { ...common, role: 'group' };
    if (part === 'groupHeading') return { ...common, role: 'presentation' };
    if (part === 'separator') return {
      ...common,
      role: config.primitive === 'Command' ? 'presentation' : 'separator',
      aria: config.primitive === 'Command' ? { hidden: true } : undefined,
    };
    if (part === 'empty' || part === 'loading') return {
      ...common,
      role: config.primitive === 'Command' ? undefined : 'status',
      aria: { live: 'polite' },
      hidden: part === 'empty' ? !state.emptyStateShown : undefined,
    };
    if ((config.primitive === 'CheckboxGroup' || config.primitive === 'RadioGroup') && part === 'item') {
      return common;
    }
    if (part === config.itemPart || part === 'item' || part === 'itemControl') return {
      ...common,
      hidden: key ? !state.visibleItems.includes(key) : undefined,
      attributes: (
        (config.primitive === 'Checkbox' && part === 'control')
        || (config.primitive === 'Toggle' && part === 'root')
        || (['CheckboxGroup', 'RadioGroup'].includes(config.primitive) && part === 'itemControl')
        || (['SegmentGroup', 'ToggleGroup'].includes(config.primitive) && part === 'item')
      ) ? { type: 'button' } : common.attributes,
      role: part === 'itemControl' ? (config.itemRole === 'checkbox' ? 'checkbox' : 'radio') : config.itemRole,
      tabIndex: state.focusedItem === key ? 0 : -1,
      disabled: state.disabled || (item?.disabled ?? false),
      aria: {
        selected: config.selectionAria === 'selected' ? selected : undefined,
        checked: config.selectionAria === 'checked'
          ? (config.booleanAlias === 'checked' && state.indeterminate ? 'mixed' : selected)
          : undefined,
        pressed: config.selectionAria === 'pressed' ? selected : undefined,
        disabled: state.disabled || (item?.disabled ?? false),
      },
      on: {
        click: (event) => {
          // Checkbox.Control is a button inside its label root. Cancelling the
          // label's native activation prevents the visually hidden form input
          // from toggling a second time after the controller has committed.
          if (config.primitive === 'Checkbox') event?.preventDefault?.();
          if (!key) return;
          (config.activation ?? (mode === 'multiple' ? 'toggle' : 'select')) === 'toggle'
            ? actions.toggle(key, 'pointer')
            : actions.select(key, 'pointer');
          if (config.closeOnSelect && mode === 'single') actions.setOpen(false);
        },
        keydown: (event) => actions.handleKeyDown(event?.key ?? '', key),
      },
    };
    if (part === 'indicator' || part === 'itemIndicator') {
      return { ...common, hidden: !selected, aria: { hidden: !selected } };
    }
    if (part === 'hiddenInput') {
      const nativeChoice = config.primitive === 'Checkbox'
        || config.primitive === 'CheckboxGroup'
        || config.primitive === 'RadioGroup';
      const nativeItem = nativeChoice || mode === 'multiple'
        ? (item ?? (config.primitive === 'Checkbox' ? state.items[0] : undefined))
        : undefined;
      const value = nativeItem?.serializedValue ?? state.formValues[0] ?? '';
      const nativeChecked = config.primitive === 'Checkbox'
        ? state.selectedKeys.includes('on')
        : selected;
      return {
        ...common,
        hidden: true,
        disabled: state.disabled,
        attributes: {
          type: nativeChoice
            ? (config.primitive === 'RadioGroup' ? 'radio' : 'checkbox')
            : 'hidden',
          name: state.name,
          value,
          form: state.form,
          checked: nativeChoice ? nativeChecked : undefined,
          required: nativeChoice ? state.required : undefined,
        },
      };
    }
    if (part === 'error') return { ...common, role: state.invalid ? 'alert' : undefined, hidden: !state.invalid, aria: { live: 'assertive' } };
    if (part === 'itemDelete') return { ...common, role: 'button', disabled: state.disabled || state.readOnly, attributes: { type: 'button' }, aria: { label: 'Remove' }, on: { click: () => key && actions.toggle(key, 'pointer') } };
    if (part === 'positioner') return { ...common, hidden: !state.open };
    return common;
  };

  const parts = Object.fromEntries(config.anatomy.map((part): [string, UIFnSelectionPart] => [part, {
    name: part,
    getProps(itemOrProps?: string | UIFnPartProps, userProps?: UIFnPartProps) {
      const argument = itemArgument(itemOrProps, userProps);
      const booleanPartKey = config.booleanAlias && (part === config.itemPart || part === 'indicator')
        ? 'on'
        : null;
      const key = argument.key ?? booleanPartKey;
      return mergePartProps(generatedFor(part, key), argument.userProps, { component: config.primitive, part, required: { id: true } });
    },
  }]));

  return createUIFnController({
    actions,
    parts,
    getState: store.getState,
    subscribe: store.subscribe,
    update(next) {
      if (next.itemAdapter !== undefined) adapter = next.itemAdapter;
      if (next.items !== undefined) actions.setItems(next.items);
      if (next.value !== undefined) actions.syncValue(next.value, next.syncSequence);
      if (next.checked !== undefined) actions.syncChecked(next.checked);
      if (next.pressed !== undefined) actions.syncPressed(next.pressed);
      if (next.open !== undefined) actions.syncOpen(next.open);
      if (next.inputValue !== undefined) actions.syncInputValue(next.inputValue, next.syncSequence);
      const patchable: Partial<UIFnSelectionState> = {
        ...(next.disabled !== undefined ? { disabled: next.disabled } : {}),
        ...(next.readOnly !== undefined ? { readOnly: next.readOnly } : {}),
        ...(next.required !== undefined ? { required: next.required } : {}),
        ...(next.nullable !== undefined ? { nullable: next.nullable } : {}),
        ...(next.orientation !== undefined ? { orientation: next.orientation } : {}),
        ...(next.direction !== undefined ? { direction: next.direction } : {}),
        ...(next.locale !== undefined ? { locale: next.locale } : {}),
        ...(next.name !== undefined ? { name: next.name } : {}),
        ...(next.form !== undefined ? { form: next.form } : {}),
        ...(next.placeholder !== undefined ? { placeholder: next.placeholder } : {}),
      };
      if (Object.keys(patchable).length > 0) patch(patchable);
    },
    destroy: store.destroy,
  });
}
