import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { focusUIFnPart } from '../internal/runtime/focus';
import { mergePartProps, type UIFnPartProps } from '../parts';
import type { TypeaheadState } from '../algorithms';
import type { ChangeMeta } from './shared';
import type { MenuItem } from './menu';
import {
  EMPTY_UIFN_TYPEAHEAD,
  advanceUIFnNavigationTypeahead,
  createUIFnNavigationCollection,
  createUIFnNavigationIds,
  getUIFnSiblingItems,
  hasUIFnChildren,
  moveUIFnNavigationKey,
  repairUIFnNavigationKey,
  resolveUIFnPrimitiveKey,
} from './navigation';

export interface MenubarItem extends MenuItem {}

export interface MenubarProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly items?: readonly MenubarItem[];
  readonly loop?: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly locale?: string;
}

export interface MenubarState {
  readonly value: string;
  readonly controlled: boolean;
  readonly items: readonly MenubarItem[];
  readonly focusedMenu: string | null;
  readonly activeItem: string | null;
  readonly submenuPath: readonly string[];
  readonly loop: boolean;
  readonly dir: 'ltr' | 'rtl';
  readonly typeahead: TypeaheadState<string>;
  readonly focusReturn: string | null;
  readonly lastChangeMeta?: ChangeMeta<string>;
}

export interface MenubarActions {
  setValue(value: string): void;
  syncValue(value: string): void;
  setItems(items: readonly MenubarItem[]): void;
  registerItem(item: MenubarItem): void;
  unregisterItem(id: string): void;
  setItemDisabled(id: string, disabled: boolean): void;
  focusMenu(id: string | null): void;
  focusItem(id: string | null): void;
  handleTriggerKeyDown(key: string, currentMenu?: string | null): string | null;
  handleContentKeyDown(key: string, currentItem?: string | null): string | null;
  openMenu(id: string, edge?: 'first' | 'last'): string | null;
  closeMenu(): string | null;
  openSubmenu(id: string): string | null;
  closeSubmenu(): string | null;
  selectItem(id: string): boolean;
}

type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type ValuePart = { readonly name: string; getProps(value: string, userProps?: UIFnPartProps): UIFnPartProps };

export interface MenubarControllerParts {
  readonly root: StaticPart;
  readonly menu: ValuePart;
  readonly trigger: ValuePart;
  readonly content: ValuePart;
  readonly item: ValuePart;
  readonly submenuTrigger: ValuePart;
  readonly submenuContent: ValuePart;
}

export type MenubarController = UIFnController<MenubarState, MenubarActions, MenubarControllerParts, MenubarProps>;

export function createMenubarController(
  props: MenubarProps = {},
  env: UIFnEnvironment = {},
): MenubarController {
  const resolvedEnv = createUIFnEnvironment(env);
  const ids = createUIFnNavigationIds('Menubar', 'menubar', resolvedEnv);
  const items = [...(props.items ?? [])];
  createUIFnNavigationCollection(items);
  const value = createControlledValue({
    value: props.value,
    defaultValue: props.defaultValue ?? '',
    onChange: props.onValueChange,
  });
  const roots = getUIFnSiblingItems(items);
  const initialValue = value.getValue();
  const initialFocused = roots.some((item) => item.id === initialValue && !item.disabled)
    ? initialValue
    : createUIFnNavigationCollection(roots).enabledKeys[0] ?? null;
  const store = createStateChannel<MenubarState, string>({
    value: initialValue,
    controlled: value.isControlled(),
    items,
    focusedMenu: initialFocused,
    activeItem: initialValue ? createUIFnNavigationCollection(getUIFnSiblingItems(items, initialValue)).enabledKeys[0] ?? null : null,
    submenuPath: [],
    loop: props.loop ?? true,
    dir: props.dir ?? resolvedEnv.getDirection(),
    typeahead: EMPTY_UIFN_TYPEAHEAD,
    focusReturn: null,
  });

  const changeValue = (next: string, source: ChangeMeta<string>['source'], reason: string) => {
    const state = store.getState();
    if (next && !createUIFnNavigationCollection(getUIFnSiblingItems(state.items)).enabledKeys.includes(next)) return;
    const result = source === 'controlled-sync' ? value.syncValue(next) : value.requestValue(next);
    const meta: ChangeMeta<string> = { source, reason, previousValue: state.value, nextValue: next };
    store.patchState({
      value: result.value,
      focusedMenu: next || state.focusedMenu,
      activeItem: next ? createUIFnNavigationCollection(getUIFnSiblingItems(state.items, next)).enabledKeys[0] ?? null : null,
      submenuPath: [],
      focusReturn: next ? null : state.focusedMenu,
      lastChangeMeta: meta,
    }, meta);
  };

  const currentParent = (state: MenubarState) => state.submenuPath.at(-1) ?? (state.value || undefined);
  const actions: MenubarActions = {
    setValue: (next) => changeValue(next, 'programmatic', next ? 'open-menu' : 'close-menu'),
    syncValue: (next) => changeValue(next, 'controlled-sync', 'controlled-value-sync'),
    setItems(nextItems) {
      const state = store.getState();
      const normalized = [...nextItems];
      createUIFnNavigationCollection(normalized);
      const focusedMenu = repairUIFnNavigationKey(
        getUIFnSiblingItems(state.items),
        getUIFnSiblingItems(normalized),
        state.focusedMenu,
      );
      const valueStillValid = !state.value || normalized.some((item) => item.id === state.value && !item.disabled && item.parentId === undefined);
      if (!valueStillValid) value.requestValue('');
      const nextValue = valueStillValid ? state.value : value.getValue();
      const parentId = state.submenuPath.at(-1) ?? (nextValue || undefined);
      store.patchState({
        items: normalized,
        value: nextValue,
        focusedMenu,
        activeItem: repairUIFnNavigationKey(state.items, normalized, state.activeItem, parentId),
        submenuPath: state.submenuPath.filter((id) => hasUIFnChildren(normalized, id)),
      });
    },
    registerItem(item) {
      const state = store.getState();
      actions.setItems(state.items.some((entry) => entry.id === item.id)
        ? state.items.map((entry) => entry.id === item.id ? item : entry)
        : [...state.items, item]);
    },
    unregisterItem(id) {
      actions.setItems(store.getState().items.filter((item) => item.id !== id && item.parentId !== id));
    },
    setItemDisabled(id, disabled) {
      actions.setItems(store.getState().items.map((item) => item.id === id ? { ...item, disabled } : item));
    },
    focusMenu(id) {
      const state = store.getState();
      if (id === null || createUIFnNavigationCollection(getUIFnSiblingItems(state.items)).enabledKeys.includes(id)) {
        store.patchState({ focusedMenu: id });
      }
    },
    focusItem(id) {
      const state = store.getState();
      if (id === null || createUIFnNavigationCollection(getUIFnSiblingItems(state.items, currentParent(state))).enabledKeys.includes(id)) {
        store.patchState({ activeItem: id });
      }
    },
    handleTriggerKeyDown(key, currentMenu) {
      const state = store.getState();
      const current = currentMenu ?? state.focusedMenu;
      if (key === 'Escape' && state.value) return actions.closeMenu();
      const command = resolveUIFnPrimitiveKey({ primitive: 'Menubar', orientation: 'horizontal', direction: state.dir, region: 'root' }, key);
      if (command === 'open-first' || command === 'open-last') return actions.openMenu(current ?? '', command === 'open-last' ? 'last' : 'first');
      const next = moveUIFnNavigationKey(state.items, current, command, { orientation: 'horizontal', direction: state.dir, loop: state.loop });
      if (next !== current) {
        store.patchState({ focusedMenu: next });
        if (state.value && next) actions.openMenu(next);
      }
      return next;
    },
    handleContentKeyDown(key, currentItem) {
      const state = store.getState();
      const current = currentItem ?? state.activeItem;
      const command = resolveUIFnPrimitiveKey({ primitive: 'Menubar', orientation: 'vertical', direction: state.dir, region: 'content' }, key);
      if (command === 'typeahead') {
        const typeahead = advanceUIFnNavigationTypeahead(state.items, { ...state.typeahead, matchedKey: current }, key, {
          parentId: currentParent(state), now: resolvedEnv.now(), locale: props.locale ?? resolvedEnv.getLocale(), loop: state.loop,
        });
        store.patchState({ typeahead, activeItem: typeahead.matchedKey });
        return typeahead.matchedKey;
      }
      if (command === 'activate' && current) {
        if (hasUIFnChildren(state.items, current)) return actions.openSubmenu(current);
        actions.selectItem(current);
        return current;
      }
      if (command === 'close') return state.submenuPath.length > 0 ? actions.closeSubmenu() : actions.closeMenu();
      const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
      if (horizontal && state.submenuPath.length === 0) return actions.handleTriggerKeyDown(key, state.value);
      const next = moveUIFnNavigationKey(state.items, current, command, { parentId: currentParent(state), orientation: 'vertical', direction: state.dir, loop: state.loop });
      if (next !== current) store.patchState({ activeItem: next });
      return next;
    },
    openMenu(id, edge = 'first') {
      const state = store.getState();
      if (!createUIFnNavigationCollection(getUIFnSiblingItems(state.items)).enabledKeys.includes(id)) return null;
      changeValue(id, 'user', 'keyboard-open-menu');
      const next = createUIFnNavigationCollection(getUIFnSiblingItems(state.items, id)).enabledKeys;
      const activeItem = (edge === 'last' ? next.at(-1) : next[0]) ?? null;
      store.patchState({ focusedMenu: id, activeItem });
      return activeItem;
    },
    closeMenu() {
      const trigger = store.getState().value || store.getState().focusedMenu;
      changeValue('', 'user', 'keyboard-close-menu');
      store.patchState({ focusedMenu: trigger, focusReturn: trigger });
      return trigger;
    },
    openSubmenu(id) {
      const state = store.getState();
      if (!hasUIFnChildren(state.items, id)) return null;
      const activeItem = createUIFnNavigationCollection(getUIFnSiblingItems(state.items, id)).enabledKeys[0] ?? null;
      store.patchState({ submenuPath: [...state.submenuPath, id], activeItem });
      return activeItem;
    },
    closeSubmenu() {
      const state = store.getState();
      const trigger = state.submenuPath.at(-1) ?? state.value ?? null;
      store.patchState({ submenuPath: state.submenuPath.slice(0, -1), activeItem: trigger, focusReturn: trigger });
      return trigger;
    },
    selectItem(id) {
      const state = store.getState();
      const item = state.items.find((entry) => entry.id === id);
      if (!item || item.disabled || hasUIFnChildren(state.items, id)) return false;
      actions.closeMenu();
      return true;
    },
  };

  const valuePart = (name: string, generated: (state: MenubarState, value: string) => UIFnPartProps): ValuePart => ({
    name,
    getProps(item, userProps) {
      return mergePartProps(generated(store.getState(), item), userProps, { component: 'Menubar', part: name, required: { id: true } });
    },
  });
  const parts: MenubarControllerParts = {
    root: {
      name: 'root',
      getProps(userProps) {
        const state = store.getState();
        return mergePartProps({ role: 'menubar', id: ids.rootId, aria: { orientation: 'horizontal' }, data: { dir: state.dir } }, userProps, {
          component: 'Menubar', part: 'root', required: { role: true, id: true, aria: ['orientation'] },
        });
      },
    },
    menu: valuePart('menu', (_state, item) => ({ id: ids.id('menu', item), data: { value: item } })),
    trigger: valuePart('trigger', (state, item) => {
      const open = state.value === item;
      const disabled = state.items.find((entry) => entry.id === item)?.disabled ?? false;
      return {
        role: 'menuitem', id: ids.id('trigger', item), tabIndex: state.focusedMenu === item ? 0 : -1,
        aria: { haspopup: 'menu', expanded: open, controls: ids.id('content', item), disabled },
        data: { state: open ? 'open' : 'closed', value: item }, disabled,
        on: {
          focus: () => actions.focusMenu(item),
          click: () => actions.openMenu(item),
          keydown: (event) => {
            const key = event?.key ?? '';
            const next = actions.handleTriggerKeyDown(key, item);
            if (!next) return;
            const opensContent = key === 'Enter' || key === ' ' || key === 'ArrowDown' || key === 'ArrowUp';
            focusUIFnPart(event, opensContent ? ids.id('item', next) : ids.id('trigger', next), { deferred: opensContent });
          },
        },
      };
    }),
    content: valuePart('content', (state, item) => ({
      role: 'menu', id: ids.id('content', item), tabIndex: -1,
      aria: { labelledby: ids.id('trigger', item) }, data: { state: state.value === item ? 'open' : 'closed' }, hidden: state.value !== item,
      on: { keydown: (event) => {
        const key = event?.key ?? '';
        const next = actions.handleContentKeyDown(key);
        if (!next) return;
        if (key === 'Escape' && store.getState().value === '') {
          focusUIFnPart(event, ids.id('trigger', next), { deferred: true });
          return;
        }
        const target = hasUIFnChildren(store.getState().items, next)
          ? ids.id('submenu-trigger', next)
          : ids.id('item', next);
        focusUIFnPart(event, target, { deferred: true });
      } },
    })),
    item: valuePart('item', (state, item) => {
      const disabled = state.items.find((entry) => entry.id === item)?.disabled ?? false;
      return {
        role: 'menuitem', id: ids.id('item', item), tabIndex: state.activeItem === item ? 0 : -1,
        aria: { disabled }, data: { highlighted: state.activeItem === item, value: item }, disabled,
        on: { focus: () => actions.focusItem(item), pointermove: () => actions.focusItem(item), click: () => actions.selectItem(item) },
      };
    }),
    submenuTrigger: valuePart('submenuTrigger', (state, item) => ({
      role: 'menuitem', id: ids.id('submenu-trigger', item), tabIndex: state.activeItem === item ? 0 : -1,
      aria: { haspopup: 'menu', expanded: state.submenuPath.includes(item), controls: ids.id('submenu-content', item) },
      data: { state: state.submenuPath.includes(item) ? 'open' : 'closed', value: item },
      on: { focus: () => actions.focusItem(item), pointermove: () => actions.focusItem(item), click: () => actions.openSubmenu(item) },
    })),
    submenuContent: valuePart('submenuContent', (state, item) => ({
      role: 'menu', id: ids.id('submenu-content', item), tabIndex: -1,
      aria: { labelledby: ids.id('submenu-trigger', item) }, data: { state: state.submenuPath.includes(item) ? 'open' : 'closed' }, hidden: !state.submenuPath.includes(item),
      on: { keydown: (event) => {
        const next = actions.handleContentKeyDown(event?.key ?? '');
        if (!next) return;
        const target = hasUIFnChildren(store.getState().items, next)
          ? ids.id('submenu-trigger', next)
          : ids.id('item', next);
        focusUIFnPart(event, target, { deferred: true });
      } },
    })),
  };

  return createUIFnController({
    actions, parts, getState: store.getState, subscribe: store.subscribe, now: resolvedEnv.now,
    update(inputs) {
      if ('value' in inputs && inputs.value !== undefined) actions.syncValue(inputs.value);
      if (inputs.items !== undefined) actions.setItems(inputs.items);
    },
    destroy() { value.destroy(); store.destroy(); },
  });
}
