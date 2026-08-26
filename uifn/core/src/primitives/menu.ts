import { createUIFnController, type UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createControlledValue } from '../internal/runtime/controlled';
import { createStateChannel } from '../internal/runtime/state-channel';
import { mergePartProps, type UIFnPartProps, type UIFnRequiredPartProps } from '../parts';
import type { ChangeMeta } from './shared';
import {
  EMPTY_UIFN_TYPEAHEAD,
  advanceUIFnNavigationTypeahead,
  createUIFnNavigationCollection,
  createUIFnNavigationIds,
  getUIFnChildItems,
  getUIFnSiblingItems,
  hasUIFnChildren,
  moveUIFnNavigationKey,
  repairUIFnNavigationKey,
  resolveUIFnPrimitiveKey,
  type UIFnNavigationItem,
} from './navigation';
import type { TypeaheadState, UIFnNavigationPrimitive } from '../algorithms';

export interface MenuItem extends UIFnNavigationItem {
  readonly group?: string;
}

export interface MenuProps {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly items?: readonly MenuItem[];
  readonly orientation?: 'horizontal' | 'vertical';
  readonly loop?: boolean;
  readonly dir?: 'ltr' | 'rtl';
  readonly locale?: string;
}

export interface MenuState {
  readonly primitive: 'Menu' | 'ContextMenu';
  readonly open: boolean;
  readonly controlled: boolean;
  readonly orientation: 'horizontal' | 'vertical';
  readonly loop: boolean;
  readonly dir: 'ltr' | 'rtl';
  readonly items: readonly MenuItem[];
  readonly activeItem: string | null;
  readonly submenuPath: readonly string[];
  readonly selectedItem: string | null;
  readonly typeahead: TypeaheadState<string>;
  readonly contextPoint: Readonly<{ x: number; y: number }> | null;
  readonly focusReturn: 'trigger' | 'parent-trigger' | null;
  readonly lastChangeMeta?: ChangeMeta<boolean>;
}

export interface MenuActions {
  setOpen(open: boolean): void;
  syncOpen(open: boolean): void;
  toggle(): void;
  openAt(x: number, y: number, modality?: 'pointer' | 'touch'): void;
  setItems(items: readonly MenuItem[]): void;
  registerItem(item: MenuItem): void;
  unregisterItem(id: string): void;
  setItemDisabled(id: string, disabled: boolean): void;
  focusItem(id: string | null): void;
  handleKeyDown(key: string, currentItem?: string | null): string | null;
  typeahead(key: string): string | null;
  selectItem(id: string): boolean;
  openSubmenu(id: string): string | null;
  closeSubmenu(): string | null;
  close(): void;
}

type StaticPart = { readonly name: string; getProps(userProps?: UIFnPartProps): UIFnPartProps };
type ValuePart = { readonly name: string; getProps(value: string, userProps?: UIFnPartProps): UIFnPartProps };

export interface MenuControllerParts {
  readonly root: StaticPart;
  readonly trigger: StaticPart;
  readonly positioner: StaticPart;
  readonly content: StaticPart;
  readonly item: ValuePart;
  readonly itemIndicator: ValuePart;
  readonly separator: ValuePart;
  readonly group: ValuePart;
  readonly groupLabel: ValuePart;
  readonly submenuTrigger: ValuePart;
  readonly submenuContent: ValuePart;
}

export type MenuController = UIFnController<MenuState, MenuActions, MenuControllerParts, MenuProps>;

function menuParent(path: readonly string[]): string | undefined {
  return path.at(-1);
}

function enabledFirst(items: readonly MenuItem[], parentId?: string, last = false): string | null {
  const enabled = createUIFnNavigationCollection(getUIFnSiblingItems(items, parentId)).enabledKeys;
  return (last ? enabled.at(-1) : enabled[0]) ?? null;
}

export function createMenuLikeController(
  primitive: 'Menu' | 'ContextMenu',
  props: MenuProps = {},
  env: UIFnEnvironment = {},
): MenuController {
  const resolvedEnv = createUIFnEnvironment(env);
  const component = primitive;
  const slug = primitive === 'Menu' ? 'menu' : 'context-menu';
  const ids = createUIFnNavigationIds(component, slug, resolvedEnv);
  const openValue = createControlledValue({
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const items = [...(props.items ?? [])];
  createUIFnNavigationCollection(items);
  const initialOpen = openValue.getValue();
  const store = createStateChannel<MenuState, boolean>({
    primitive,
    open: initialOpen,
    controlled: openValue.isControlled(),
    orientation: props.orientation ?? 'vertical',
    loop: props.loop ?? true,
    dir: props.dir ?? resolvedEnv.getDirection(),
    items,
    activeItem: initialOpen ? enabledFirst(items) : null,
    submenuPath: [],
    selectedItem: null,
    typeahead: EMPTY_UIFN_TYPEAHEAD,
    contextPoint: null,
    focusReturn: null,
  });

  const changeOpen = (
    next: boolean,
    source: ChangeMeta<boolean>['source'],
    reason: string,
    inputModality?: ChangeMeta<boolean>['inputModality'],
  ) => {
    const state = store.getState();
    const result = source === 'controlled-sync' ? openValue.syncValue(next) : openValue.requestValue(next);
    const meta: ChangeMeta<boolean> = {
      source,
      reason,
      previousValue: state.open,
      nextValue: next,
      inputModality,
    };
    store.patchState({
      open: result.value,
      activeItem: next ? state.activeItem ?? enabledFirst(state.items) : state.activeItem,
      submenuPath: next ? state.submenuPath : [],
      typeahead: next ? state.typeahead : EMPTY_UIFN_TYPEAHEAD,
      focusReturn: next ? null : 'trigger',
      lastChangeMeta: meta,
    }, meta);
  };

  const actions: MenuActions = {
    setOpen: (open) => changeOpen(open, 'programmatic', open ? 'open' : 'close'),
    syncOpen: (open) => changeOpen(open, 'controlled-sync', 'controlled-open-sync'),
    toggle: () => actions.setOpen(!store.getState().open),
    openAt(x, y, modality = 'pointer') {
      store.patchState({ contextPoint: { x, y } });
      changeOpen(true, 'user', primitive === 'ContextMenu' ? 'context-open' : 'pointer-open', modality);
    },
    setItems(nextItems) {
      const state = store.getState();
      const normalized = [...nextItems];
      createUIFnNavigationCollection(normalized);
      const validPath: string[] = [];
      for (const id of state.submenuPath) {
        if (!hasUIFnChildren(normalized, id)) break;
        validPath.push(id);
      }
      const parentId = menuParent(validPath);
      const repaired = repairUIFnNavigationKey(state.items, normalized, state.activeItem, parentId);
      store.patchState({ items: normalized, submenuPath: validPath, activeItem: repaired });
    },
    registerItem(item) {
      const state = store.getState();
      if (state.items.some((entry) => entry.id === item.id)) {
        actions.setItems(state.items.map((entry) => entry.id === item.id ? item : entry));
        return;
      }
      actions.setItems([...state.items, item]);
    },
    unregisterItem(id) {
      actions.setItems(store.getState().items.filter((item) => item.id !== id && item.parentId !== id));
    },
    setItemDisabled(id, disabled) {
      const state = store.getState();
      actions.setItems(state.items.map((item) => item.id === id ? { ...item, disabled } : item));
    },
    focusItem(id) {
      const state = store.getState();
      if (id === null) {
        store.patchState({ activeItem: null });
        return;
      }
      const item = state.items.find((entry) => entry.id === id);
      if (!item || item.disabled) return;
      store.patchState({ activeItem: id });
    },
    handleKeyDown(key, currentItem) {
      const state = store.getState();
      const current = currentItem ?? state.activeItem;
      const command = resolveUIFnPrimitiveKey({
        primitive,
        orientation: state.orientation,
        direction: state.dir,
        region: 'content',
      }, key);
      if (command === 'typeahead') return actions.typeahead(key);
      if (command === 'activate' && current) {
        if (hasUIFnChildren(state.items, current)) return actions.openSubmenu(current);
        actions.selectItem(current);
        return current;
      }
      if (command === 'open' && current && hasUIFnChildren(state.items, current)) {
        return actions.openSubmenu(current);
      }
      if (command === 'close') {
        if (state.submenuPath.length > 0) return actions.closeSubmenu();
        actions.close();
        return null;
      }
      const next = moveUIFnNavigationKey(state.items, current, command, {
        parentId: menuParent(state.submenuPath),
        orientation: 'vertical',
        direction: state.dir,
        loop: state.loop,
      });
      if (next !== current) store.patchState({ activeItem: next });
      return next;
    },
    typeahead(key) {
      const state = store.getState();
      const typeahead = advanceUIFnNavigationTypeahead(state.items, {
        ...state.typeahead,
        matchedKey: state.activeItem,
      }, key, {
        parentId: menuParent(state.submenuPath),
        now: resolvedEnv.now(),
        locale: props.locale ?? resolvedEnv.getLocale(),
        loop: state.loop,
      });
      store.patchState({ typeahead, activeItem: typeahead.matchedKey });
      return typeahead.matchedKey;
    },
    selectItem(id) {
      const state = store.getState();
      const item = state.items.find((entry) => entry.id === id);
      if (!item || item.disabled || hasUIFnChildren(state.items, id)) return false;
      store.patchState({ selectedItem: id });
      actions.close();
      return true;
    },
    openSubmenu(id) {
      const state = store.getState();
      const item = state.items.find((entry) => entry.id === id);
      if (!item || item.disabled || !hasUIFnChildren(state.items, id)) return null;
      const next = enabledFirst(state.items, id);
      store.patchState({ submenuPath: [...state.submenuPath, id], activeItem: next, focusReturn: null });
      return next;
    },
    closeSubmenu() {
      const state = store.getState();
      const trigger = state.submenuPath.at(-1) ?? null;
      if (!trigger) return null;
      store.patchState({
        submenuPath: state.submenuPath.slice(0, -1),
        activeItem: trigger,
        focusReturn: 'parent-trigger',
      });
      return trigger;
    },
    close: () => changeOpen(false, 'user', 'dismiss', 'keyboard'),
  };

  const valuePart = (
    name: string,
    generated: (state: MenuState, value: string) => UIFnPartProps,
    required: UIFnRequiredPartProps = {},
  ): ValuePart => ({
    name,
    getProps(value, userProps) {
      return mergePartProps(generated(store.getState(), value), userProps, { component, part: name, required });
    },
  });
  const staticPart = (
    name: string,
    generated: (state: MenuState) => UIFnPartProps,
    required: UIFnRequiredPartProps = {},
  ): StaticPart => ({
    name,
    getProps(userProps) {
      return mergePartProps(generated(store.getState()), userProps, { component, part: name, required });
    },
  });

  const parts: MenuControllerParts = {
    root: staticPart('root', (state) => ({
      id: ids.rootId,
      data: { state: state.open ? 'open' : 'closed', dir: state.dir },
    }), { id: true, data: ['state'] }),
    trigger: staticPart('trigger', (state) => ({
      id: ids.id('trigger'),
      aria: primitive === 'ContextMenu'
        ? { haspopup: 'menu', controls: ids.id('content') }
        : { haspopup: 'menu', expanded: state.open, controls: ids.id('content') },
      tabIndex: primitive === 'ContextMenu' ? 0 : undefined,
      data: { state: state.open ? 'open' : 'closed' },
      on: {
        click: primitive === 'ContextMenu' ? undefined : () => actions.toggle(),
        contextmenu: (event) => {
          event?.preventDefault?.();
          actions.openAt(event?.clientX ?? 0, event?.clientY ?? 0, 'pointer');
        },
        keydown: primitive === 'ContextMenu'
          ? (event) => {
              const opensContextMenu = event?.key === 'ContextMenu' || (event?.key === 'F10' && event.shiftKey);
              if (!opensContextMenu) return;
              event.preventDefault?.();
              store.patchState({ contextPoint: null });
              changeOpen(true, 'user', 'context-keyboard-open', 'keyboard');
            }
          : undefined,
      },
    }), {
      id: true,
      tabIndex: primitive === 'ContextMenu' ? true : undefined,
      aria: primitive === 'ContextMenu' ? ['haspopup', 'controls'] : ['haspopup', 'expanded', 'controls'],
    }),
    positioner: staticPart('positioner', (state) => ({
      id: ids.id('positioner'),
      data: { state: state.open ? 'open' : 'closed' },
      hidden: !state.open,
    }), { id: true, data: ['state'] }),
    content: staticPart('content', (state) => ({
      role: 'menu',
      id: ids.id('content'),
      tabIndex: -1,
      aria: { orientation: state.orientation },
      data: { state: state.open ? 'open' : 'closed', activeItem: state.activeItem },
      hidden: !state.open,
      on: { keydown: (event) => actions.handleKeyDown(event?.key ?? '') },
    }), { role: true, id: true, tabIndex: true, aria: ['orientation'], data: ['state'] }),
    item: valuePart('item', (state, value) => {
      const item = state.items.find((entry) => entry.id === value);
      const active = state.activeItem === value;
      return {
        role: 'menuitem',
        id: ids.id('item', value),
        tabIndex: active ? 0 : -1,
        aria: { disabled: item?.disabled ?? false },
        data: { highlighted: active, disabled: item?.disabled ?? false, value },
        disabled: item?.disabled ?? false,
        on: {
          pointermove: () => actions.focusItem(value),
          focus: () => actions.focusItem(value),
          click: () => actions.selectItem(value),
        },
      };
    }, { role: true, id: true, tabIndex: true, aria: ['disabled'] }),
    itemIndicator: valuePart('itemIndicator', (state, value) => ({
      id: ids.id('item-indicator', value),
      aria: { hidden: true },
      data: { selected: state.selectedItem === value },
      hidden: state.selectedItem !== value,
    }), { id: true }),
    separator: valuePart('separator', (_state, value) => ({ role: 'separator', id: ids.id('separator', value) }), { role: true, id: true }),
    group: valuePart('group', (_state, value) => ({ role: 'group', id: ids.id('group', value), aria: { labelledby: ids.id('group-label', value) } }), { role: true, id: true }),
    groupLabel: valuePart('groupLabel', (_state, value) => ({ id: ids.id('group-label', value) }), { id: true }),
    submenuTrigger: valuePart('submenuTrigger', (state, value) => {
      const open = state.submenuPath.includes(value);
      const item = state.items.find((entry) => entry.id === value);
      return {
        role: 'menuitem',
        id: ids.id('submenu-trigger', value),
        tabIndex: state.activeItem === value ? 0 : -1,
        aria: { haspopup: 'menu', expanded: open, controls: ids.id('submenu-content', value), disabled: item?.disabled ?? false },
        data: { state: open ? 'open' : 'closed', highlighted: state.activeItem === value, value },
        disabled: item?.disabled ?? false,
        on: {
          pointermove: () => actions.focusItem(value),
          click: () => actions.openSubmenu(value),
        },
      };
    }, { role: true, id: true, tabIndex: true, aria: ['haspopup', 'expanded', 'controls'] }),
    submenuContent: valuePart('submenuContent', (state, value) => {
      const open = state.submenuPath.includes(value);
      return {
        role: 'menu',
        id: ids.id('submenu-content', value),
        tabIndex: -1,
        aria: { labelledby: ids.id('submenu-trigger', value) },
        data: { state: open ? 'open' : 'closed' },
        hidden: !open,
        on: { keydown: (event) => actions.handleKeyDown(event?.key ?? '') },
      };
    }, { role: true, id: true, tabIndex: true, aria: ['labelledby'], data: ['state'] }),
  };

  return createUIFnController({
    actions,
    parts,
    getState: store.getState,
    update(inputs) {
      if ('open' in inputs && inputs.open !== undefined) actions.syncOpen(inputs.open);
      if (inputs.items !== undefined) actions.setItems(inputs.items);
    },
    subscribe: store.subscribe,
    now: resolvedEnv.now,
    destroy() {
      openValue.destroy();
      store.destroy();
    },
  });
}

export function createMenuController(props: MenuProps = {}, env: UIFnEnvironment = {}): MenuController {
  return createMenuLikeController('Menu', props, env);
}
