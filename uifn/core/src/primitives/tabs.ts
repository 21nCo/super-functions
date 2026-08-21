import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps } from '../parts';
import type { ChangeMeta } from './shared';
import {
  createUIFnNavigationCollection,
  createUIFnNavigationIds,
  moveUIFnNavigationKey,
  repairUIFnNavigationKey,
  resolveUIFnPrimitiveKey,
  type UIFnNavigationItem,
} from './navigation';

export interface TabsProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly activationMode?: 'automatic' | 'manual';
  readonly loop?: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly disabled?: boolean;
  readonly items?: readonly string[];
  readonly disabledItems?: readonly string[];
}
export interface TabsState {
  readonly value: string;
  readonly controlled: boolean;
  readonly orientation: 'horizontal' | 'vertical';
  readonly activationMode: 'automatic' | 'manual';
  readonly loop: boolean;
  readonly dir: 'ltr' | 'rtl';
  readonly disabled: boolean;
  readonly items: readonly string[];
  readonly disabledItems: readonly string[];
  readonly focusedItem: string | null;
  readonly requestedRepair: string | null;
  readonly lastChangeMeta?: ChangeMeta<string>;
}
export interface TabsActions {
  setValue(value: string): void;
  syncValue(value: string): void;
  setItems(items: readonly string[], disabledItems?: readonly string[]): void;
  registerItem(value: string, disabled?: boolean): void;
  unregisterItem(value: string): void;
  setItemDisabled(value: string, disabled: boolean): void;
  focusItem(value: string): void;
  handleKeyDown(key: string, currentItem?: string): string | null;
}
type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type ValuePart = { readonly name: string; getProps(value: string, userProps?: UIFnPartProps): UIFnPartProps };
export interface TabsControllerParts {
  readonly root: StaticPart;
  readonly list: StaticPart;
  readonly trigger: ValuePart;
  readonly content: ValuePart;
  readonly indicator: StaticPart;
}
export type TabsController = UIFnController<TabsState, TabsActions, TabsControllerParts, TabsProps>;

function tabItems(items: readonly string[], disabledItems: readonly string[]): readonly UIFnNavigationItem[] {
  const disabled = new Set(disabledItems);
  return items.map((id) => ({ id, textValue: id, disabled: disabled.has(id) }));
}
function normalize(items: readonly string[]): readonly string[] {
  return [...new Set(items.filter(Boolean))];
}

export function createTabsController(props: TabsProps = {}, env: UIFnEnvironment = {}): TabsController {
  const resolvedEnv = createUIFnEnvironment(env);
  const ids = createUIFnNavigationIds('Tabs', 'tabs', resolvedEnv);
  const items = normalize(props.items ?? []);
  const disabledItems = normalize(props.disabledItems ?? []).filter((item) => items.includes(item));
  const initialCollection = createUIFnNavigationCollection(tabItems(items, disabledItems));
  const value = createControlledValue({ value: props.value, defaultValue: props.defaultValue ?? initialCollection.enabledKeys[0] ?? '', onChange: props.onValueChange });
  const initialValue = value.getValue();
  const store = createStateChannel<TabsState, string>({
    value: initialValue, controlled: value.isControlled(), orientation: props.orientation ?? 'horizontal', activationMode: props.activationMode ?? 'automatic',
    loop: props.loop ?? true, dir: props.dir ?? resolvedEnv.getDirection(), disabled: props.disabled ?? false,
    items, disabledItems, focusedItem: initialCollection.enabledKeys.includes(initialValue) ? initialValue : initialCollection.enabledKeys[0] ?? null,
    requestedRepair: null,
  });
  const changeValue = (next: string, source: ChangeMeta<string>['source'], reason: string) => {
    const state = store.getState();
    if (state.disabled && source !== 'controlled-sync') return;
    if (next && !createUIFnNavigationCollection(tabItems(state.items, state.disabledItems)).enabledKeys.includes(next)) return;
    const result = source === 'controlled-sync' ? value.syncValue(next) : value.requestValue(next);
    const meta: ChangeMeta<string> = { source, reason, previousValue: state.value, nextValue: next };
    store.patchState({ value: result.value, focusedItem: next || state.focusedItem, requestedRepair: null, lastChangeMeta: meta }, meta);
  };
  const actions: TabsActions = {
    setValue: (next) => changeValue(next, 'programmatic', 'activate-tab'),
    syncValue: (next) => changeValue(next, 'controlled-sync', 'controlled-value-sync'),
    setItems(nextItems, nextDisabledItems = store.getState().disabledItems) {
      const state = store.getState();
      const normalizedItems = normalize(nextItems);
      const normalizedDisabled = normalize(nextDisabledItems).filter((item) => normalizedItems.includes(item));
      const previous = tabItems(state.items, state.disabledItems);
      const next = tabItems(normalizedItems, normalizedDisabled);
      createUIFnNavigationCollection(next);
      const focusedItem = repairUIFnNavigationKey(previous, next, state.focusedItem);
      const validValue = !state.value || createUIFnNavigationCollection(next).enabledKeys.includes(state.value);
      const repairedValue = validValue ? state.value : repairUIFnNavigationKey(previous, next, state.value);
      let nextValue = state.value;
      let requestedRepair: string | null = null;
      if (!validValue) {
        const requested = repairedValue ?? '';
        const result = value.requestValue(requested);
        nextValue = result.value;
        requestedRepair = value.isControlled() ? requested : null;
      }
      store.patchState({ items: normalizedItems, disabledItems: normalizedDisabled, focusedItem, value: nextValue, requestedRepair });
    },
    registerItem(item, disabled = false) {
      const state = store.getState();
      if (state.items.includes(item)) { actions.setItemDisabled(item, disabled); return; }
      actions.setItems([...state.items, item], disabled ? [...state.disabledItems, item] : state.disabledItems);
    },
    unregisterItem: (item) => actions.setItems(store.getState().items.filter((entry) => entry !== item), store.getState().disabledItems.filter((entry) => entry !== item)),
    setItemDisabled(item, disabled) {
      const state = store.getState(); if (!state.items.includes(item)) return;
      actions.setItems(state.items, disabled ? [...state.disabledItems, item] : state.disabledItems.filter((entry) => entry !== item));
    },
    focusItem(item) {
      const state = store.getState();
      if (createUIFnNavigationCollection(tabItems(state.items, state.disabledItems)).enabledKeys.includes(item)) store.patchState({ focusedItem: item });
    },
    handleKeyDown(key, currentItem) {
      const state = store.getState();
      const current = currentItem ?? state.focusedItem;
      const command = resolveUIFnPrimitiveKey({ primitive: 'Tabs', orientation: state.orientation, direction: state.dir, region: 'root' }, key);
      if (command === 'activate') {
        if (current) actions.setValue(current);
        return current;
      }
      const next = moveUIFnNavigationKey(tabItems(state.items, state.disabledItems), current, command, { orientation: state.orientation, direction: state.dir, loop: state.loop });
      if (next && next !== current) {
        const meta: ChangeMeta<string> = {
          source: 'user',
          reason: 'keyboard-navigation',
          previousValue: state.value,
          nextValue: state.value,
          inputModality: 'keyboard',
        };
        store.patchState({ focusedItem: next }, meta);
        if (state.activationMode === 'automatic') actions.setValue(next);
      }
      return next;
    },
  };
  const valuePart = (name: string, generated: (state: TabsState, item: string) => UIFnPartProps): ValuePart => ({ name, getProps(item, userProps) { return mergePartProps(generated(store.getState(), item), userProps, { component: 'Tabs', part: name, required: { id: true } }); } });
  const parts: TabsControllerParts = {
    root: { name: 'root', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.rootId, data: { orientation: state.orientation, dir: state.dir, disabled: state.disabled } }, userProps, { component: 'Tabs', part: 'root', required: { id: true } }); } },
    list: { name: 'list', getProps(userProps) { const state = store.getState(); return mergePartProps({ role: 'tablist', id: ids.id('list'), aria: { orientation: state.orientation }, data: { orientation: state.orientation } }, userProps, { component: 'Tabs', part: 'list', required: { role: true, id: true, aria: ['orientation'] } }); } },
    trigger: valuePart('trigger', (state, item) => { const selected = state.value === item; const disabled = state.disabled || state.disabledItems.includes(item); return { role: 'tab', id: ids.id('trigger', item), tabIndex: state.focusedItem === item ? 0 : -1, aria: { selected, controls: ids.id('content', item), disabled }, data: { state: selected ? 'active' : 'inactive', value: item }, disabled, on: { focus: () => actions.focusItem(item), click: () => actions.setValue(item), keydown: (event) => actions.handleKeyDown(event?.key ?? '', item) } }; }),
    content: valuePart('content', (state, item) => { const selected = state.value === item; return { role: 'tabpanel', id: ids.id('content', item), tabIndex: 0, aria: { labelledby: ids.id('trigger', item) }, data: { state: selected ? 'active' : 'inactive', value: item }, hidden: !selected }; }),
    indicator: { name: 'indicator', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.id('indicator'), aria: { hidden: true }, data: { value: state.value, orientation: state.orientation }, hidden: !state.value }, userProps, { component: 'Tabs', part: 'indicator', required: { id: true } }); } },
  };
  return createUIFnController({ actions, parts, getState: store.getState, subscribe: store.subscribe, now: resolvedEnv.now,
    update(inputs) { if ('value' in inputs && inputs.value !== undefined) actions.syncValue(inputs.value); if (inputs.items !== undefined || inputs.disabledItems !== undefined) actions.setItems(inputs.items ?? store.getState().items, inputs.disabledItems ?? store.getState().disabledItems); },
    destroy() { value.destroy(); store.destroy(); },
  });
}
