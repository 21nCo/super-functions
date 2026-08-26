import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { focusUIFnPart } from '../internal/runtime/focus';
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

export interface NavigationMenuItem extends UIFnNavigationItem {
  readonly hasContent?: boolean;
}

export interface NavigationMenuProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly items?: readonly NavigationMenuItem[];
  readonly orientation?: 'horizontal' | 'vertical';
  readonly delayDuration?: number;
  readonly skipDelayDuration?: number;
  readonly loop?: boolean;
  readonly dir?: 'ltr' | 'rtl';
}

export interface NavigationMenuState {
  readonly value: string;
  readonly controlled: boolean;
  readonly items: readonly NavigationMenuItem[];
  readonly focusedItem: string | null;
  readonly orientation: 'horizontal' | 'vertical';
  readonly dir: 'ltr' | 'rtl';
  readonly loop: boolean;
  readonly delayDuration: number;
  readonly skipDelayDuration: number;
  readonly pendingIntent: Readonly<{ type: 'open' | 'close'; value: string; delay: number }> | null;
  readonly focusReturn: string | null;
  readonly lastChangeMeta?: ChangeMeta<string>;
}

export interface NavigationMenuActions {
  setValue(value: string): void;
  syncValue(value: string): void;
  setItems(items: readonly NavigationMenuItem[]): void;
  registerItem(item: NavigationMenuItem): void;
  unregisterItem(id: string): void;
  setItemDisabled(id: string, disabled: boolean): void;
  focusItem(id: string | null): void;
  handleKeyDown(key: string, currentItem?: string | null): string | null;
  requestOpen(id: string): number;
  requestClose(id?: string): number;
  commitIntent(type: 'open' | 'close', id: string): void;
  cancelIntent(): void;
}

type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type ValuePart = { readonly name: string; getProps(value: string, userProps?: UIFnPartProps): UIFnPartProps };
export interface NavigationMenuControllerParts {
  readonly root: StaticPart;
  readonly list: StaticPart;
  readonly item: ValuePart;
  readonly trigger: ValuePart;
  readonly content: ValuePart;
  readonly link: ValuePart;
  readonly viewport: StaticPart;
  readonly indicator: StaticPart;
}
export type NavigationMenuController = UIFnController<NavigationMenuState, NavigationMenuActions, NavigationMenuControllerParts, NavigationMenuProps>;

export function createNavigationMenuController(
  props: NavigationMenuProps = {},
  env: UIFnEnvironment = {},
): NavigationMenuController {
  const resolvedEnv = createUIFnEnvironment(env);
  const ids = createUIFnNavigationIds('NavigationMenu', 'navigation-menu', resolvedEnv);
  const items = [...(props.items ?? [])];
  const collection = createUIFnNavigationCollection(items);
  const value = createControlledValue({ value: props.value, defaultValue: props.defaultValue ?? '', onChange: props.onValueChange });
  const store = createStateChannel<NavigationMenuState, string>({
    value: value.getValue(), controlled: value.isControlled(), items,
    focusedItem: collection.enabledKeys.includes(value.getValue()) ? value.getValue() : collection.enabledKeys[0] ?? null,
    orientation: props.orientation ?? 'horizontal', dir: props.dir ?? resolvedEnv.getDirection(), loop: props.loop ?? true,
    delayDuration: Math.max(0, props.delayDuration ?? 200), skipDelayDuration: Math.max(0, props.skipDelayDuration ?? 300),
    pendingIntent: null, focusReturn: null,
  });
  const changeValue = (next: string, source: ChangeMeta<string>['source'], reason: string) => {
    const state = store.getState();
    if (next && !createUIFnNavigationCollection(state.items).enabledKeys.includes(next)) return;
    const result = source === 'controlled-sync' ? value.syncValue(next) : value.requestValue(next);
    const meta: ChangeMeta<string> = { source, reason, previousValue: state.value, nextValue: next };
    store.patchState({ value: result.value, focusedItem: next || state.focusedItem, focusReturn: next ? null : state.value || state.focusedItem, pendingIntent: null, lastChangeMeta: meta }, meta);
  };
  const actions: NavigationMenuActions = {
    setValue: (next) => changeValue(next, 'programmatic', next ? 'open-item' : 'close-item'),
    syncValue: (next) => changeValue(next, 'controlled-sync', 'controlled-value-sync'),
    setItems(nextItems) {
      const state = store.getState();
      const normalized = [...nextItems];
      createUIFnNavigationCollection(normalized);
      const focusedItem = repairUIFnNavigationKey(state.items, normalized, state.focusedItem);
      const valid = !state.value || normalized.some((item) => item.id === state.value && !item.disabled);
      if (!valid) value.requestValue('');
      store.patchState({ items: normalized, focusedItem, value: valid ? state.value : value.getValue(), focusReturn: valid ? state.focusReturn : state.value });
    },
    registerItem(item) {
      const state = store.getState();
      actions.setItems(state.items.some((entry) => entry.id === item.id) ? state.items.map((entry) => entry.id === item.id ? item : entry) : [...state.items, item]);
    },
    unregisterItem: (id) => actions.setItems(store.getState().items.filter((item) => item.id !== id)),
    setItemDisabled: (id, disabled) => actions.setItems(store.getState().items.map((item) => item.id === id ? { ...item, disabled } : item)),
    focusItem(id) {
      if (id === null || createUIFnNavigationCollection(store.getState().items).enabledKeys.includes(id)) store.patchState({ focusedItem: id });
    },
    handleKeyDown(key, currentItem) {
      const state = store.getState();
      const current = currentItem ?? state.focusedItem;
      const command = resolveUIFnPrimitiveKey({ primitive: 'NavigationMenu', orientation: state.orientation, direction: state.dir, region: 'root' }, key);
      if (command === 'activate' && current) {
        const item = state.items.find((entry) => entry.id === current);
        if (item && item.hasContent !== false) actions.setValue(state.value === current ? '' : current);
        return current;
      }
      if (command === 'close') { actions.setValue(''); return state.focusedItem; }
      const next = moveUIFnNavigationKey(state.items, current, command, { orientation: state.orientation, direction: state.dir, loop: state.loop });
      if (next !== current) store.patchState({ focusedItem: next });
      return next;
    },
    requestOpen(id) {
      const state = store.getState();
      const delay = state.value ? state.skipDelayDuration : state.delayDuration;
      store.patchState({ pendingIntent: { type: 'open', value: id, delay } });
      return delay;
    },
    requestClose(id = store.getState().value) {
      const delay = store.getState().skipDelayDuration;
      store.patchState({ pendingIntent: { type: 'close', value: id, delay } });
      return delay;
    },
    commitIntent(type, id) {
      const intent = store.getState().pendingIntent;
      if (!intent || intent.type !== type || intent.value !== id) return;
      actions.setValue(type === 'open' ? id : '');
    },
    cancelIntent: () => store.patchState({ pendingIntent: null }),
  };
  const valuePart = (name: string, generated: (state: NavigationMenuState, value: string) => UIFnPartProps): ValuePart => ({
    name, getProps(item, userProps) { return mergePartProps(generated(store.getState(), item), userProps, { component: 'NavigationMenu', part: name, required: { id: true } }); },
  });
  const parts: NavigationMenuControllerParts = {
    root: { name: 'root', getProps(userProps) { const state = store.getState(); return mergePartProps({ role: 'navigation', id: ids.rootId, data: { orientation: state.orientation, dir: state.dir } }, userProps, { component: 'NavigationMenu', part: 'root', required: { role: true, id: true } }); } },
    list: { name: 'list', getProps(userProps) { return mergePartProps({ role: 'list', id: ids.id('list') }, userProps, { component: 'NavigationMenu', part: 'list', required: { role: true, id: true } }); } },
    item: valuePart('item', (_state, item) => ({ role: 'listitem', id: ids.id('item', item), data: { value: item } })),
    trigger: valuePart('trigger', (state, item) => {
      const open = state.value === item; const disabled = state.items.find((entry) => entry.id === item)?.disabled ?? false;
      return { id: ids.id('trigger', item), tabIndex: state.focusedItem === item ? 0 : -1, aria: { expanded: open, controls: ids.id('content', item), disabled }, data: { state: open ? 'open' : 'closed' }, disabled,
        on: {
          focus: () => actions.focusItem(item),
          pointerenter: () => actions.requestOpen(item),
          pointerleave: () => actions.requestClose(item),
          click: () => actions.setValue(open ? '' : item),
          keydown: (event) => {
            const key = event?.key ?? '';
            const next = actions.handleKeyDown(key, item);
            if (key === 'Enter' || key === ' ') event?.preventDefault?.();
            if (next && next !== item) focusUIFnPart(event, ids.id('trigger', next));
          },
        } };
    }),
    content: valuePart('content', (state, item) => ({ id: ids.id('content', item), aria: { labelledby: ids.id('trigger', item) }, data: { state: state.value === item ? 'open' : 'closed' }, hidden: state.value !== item, on: { pointerenter: () => actions.cancelIntent(), pointerleave: () => actions.requestClose(item), keydown: (event) => {
      const key = event?.key ?? '';
      const next = actions.handleKeyDown(key, item);
      if (key === 'Escape' && next) focusUIFnPart(event, ids.id('trigger', next));
    } } })),
    link: valuePart('link', (state, item) => ({ id: ids.id('link', item), tabIndex: state.focusedItem === item ? 0 : -1, attributes: { href: state.items.find((entry) => entry.id === item)?.href }, data: { active: state.value === item }, on: { focus: () => actions.focusItem(item), keydown: (event) => {
      const next = actions.handleKeyDown(event?.key ?? '', item);
      if (next && next !== item) focusUIFnPart(event, ids.id('trigger', next));
    } } })),
    viewport: { name: 'viewport', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.id('viewport'), data: { state: state.value ? 'open' : 'closed' }, hidden: !state.value }, userProps, { component: 'NavigationMenu', part: 'viewport', required: { id: true, data: ['state'] } }); } },
    indicator: { name: 'indicator', getProps(userProps) { const state = store.getState(); return mergePartProps({ id: ids.id('indicator'), aria: { hidden: true }, data: { state: state.value ? 'visible' : 'hidden', value: state.value }, hidden: !state.value }, userProps, { component: 'NavigationMenu', part: 'indicator', required: { id: true } }); } },
  };
  return createUIFnController({ actions, parts, getState: store.getState, subscribe: store.subscribe, now: resolvedEnv.now,
    update(inputs) { if ('value' in inputs && inputs.value !== undefined) actions.syncValue(inputs.value); if (inputs.items !== undefined) actions.setItems(inputs.items); },
    destroy() { value.destroy(); store.destroy(); },
  });
}
