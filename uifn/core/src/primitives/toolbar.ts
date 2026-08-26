import { createStateChannel } from '../internal/runtime/state-channel';
import { createUIFnError, type UIFnError } from '../errors';
import { createListCollection, reconcileCollectionKey } from '../algorithms/collection';
import { getNextCollectionKey } from '../algorithms/navigation';

export interface ToolbarItem {
  id: string;
  group?: string;
  disabled?: boolean;
}

export interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical';
  items?: ToolbarItem[];
  loop?: boolean;
  dir?: 'ltr' | 'rtl';
  disabled?: boolean;
  ariaLabel?: string;
}

export interface ToolbarState {
  orientation: 'horizontal' | 'vertical';
  loop: boolean;
  dir: 'ltr' | 'rtl';
  disabled: boolean;
  items: ToolbarItem[];
  focusedItem: string | null;
  groups: Record<string, string[]>;
  lastError: UIFnError | null;
}

export interface ToolbarActions {
  registerItem: (item: ToolbarItem) => void;
  setItems: (items: ToolbarItem[]) => void;
  focusItem: (itemId: string | null) => void;
  handleKeyDown: (key: string, currentItem?: string | null) => string | null;
  getGroupItems: (group: string) => string[];
}

export interface ToolbarRuntime {
  readonly state: ToolbarState;
  readonly actions: ToolbarActions;
  getState: () => ToolbarState;
  subscribe: (callback: (state: ToolbarState) => void) => () => void;
  destroy: () => void;
}

function collection(items: readonly ToolbarItem[] | undefined, disabled = false) {
  return createListCollection({
    items: items ?? [],
    getKey: (item: ToolbarItem) => item.id,
    getTextValue: (item: ToolbarItem) => item.id,
    isDisabled: (item: ToolbarItem) => disabled || Boolean(item.disabled),
  });
}

function resolveGroups(items: ToolbarItem[]): Record<string, string[]> {
  return items.reduce<Record<string, string[]>>((acc, item) => {
    if (!item.group) {
      return acc;
    }

    const existing = acc[item.group] ?? [];
    acc[item.group] = [...existing, item.id];
    return acc;
  }, {});
}

export function createToolbarRuntime(props: ToolbarProps): ToolbarRuntime {
  const initialCollection = collection(props.items, props.disabled);
  const items = [...initialCollection.items];
  const enabledItems = [...initialCollection.enabledKeys];
  const store = createStateChannel<ToolbarState>({
    orientation: props.orientation ?? 'horizontal',
    loop: props.loop ?? true,
    dir: props.dir ?? 'ltr',
    disabled: props.disabled ?? false,
    items,
    focusedItem: enabledItems[0] ?? null,
    groups: resolveGroups(items),
    lastError: null,
  });

  const actions: ToolbarActions = {
    registerItem(item) {
      const state = store.getState();
      if (state.items.some((entry) => entry.id === item.id)) {
        return;
      }

      const nextItems = [...state.items, item];
      const nextEnabled = [...collection(nextItems, state.disabled).enabledKeys];
      store.patchState({
        items: nextItems,
        groups: resolveGroups(nextItems),
        focusedItem: state.focusedItem ?? nextEnabled[0] ?? null,
      });
    },
    setItems(nextItems) {
      const state = store.getState();
      const previousIndex = state.focusedItem ? state.items.findIndex((item) => item.id === state.focusedItem) : 0;
      const nextCollection = collection(nextItems, state.disabled);
      const normalized = [...nextCollection.items];
      const nextFocused = reconcileCollectionKey(nextCollection, { previousKey: state.focusedItem, previousIndex });
      store.patchState({
        items: normalized,
        groups: resolveGroups(normalized),
        focusedItem: nextFocused,
      });
    },
    focusItem(itemId) {
      const state = store.getState();
      if (itemId === null) {
        store.patchState({
          focusedItem: null,
        });
        return;
      }

      if (!collection(state.items, state.disabled).enabledKeys.includes(itemId)) {
        return;
      }

      store.patchState({
        focusedItem: itemId,
      });
    },
    handleKeyDown(key, currentItem) {
      const state = store.getState();
      const currentCollection = collection(state.items, state.disabled);
      if (currentCollection.enabledKeys.length === 0) {
        return null;
      }
      const current = currentItem ?? state.focusedItem ?? currentCollection.enabledKeys[0] ?? null;
      const nextItem = getNextCollectionKey({
        collection: currentCollection,
        key,
        currentKey: current,
        orientation: state.orientation,
        direction: state.dir,
        loop: state.loop,
      });
      if (!nextItem) {
        return null;
      }

      store.patchState({
        focusedItem: nextItem,
      });
      return nextItem;
    },
    getGroupItems(group) {
      const state = store.getState();
      const groupItems = state.groups[group];
      if (!groupItems) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_INVALID_VALUE',
            package: '@uifn/core',
            component: 'Toolbar',
            message: 'Toolbar orientation and grouping semantics are documented and tested.',
            recoverable: true,
            details: {
              group,
            },
          }),
        });
        return [];
      }

      return groupItems;
    },
  };

  return {
    get state() {
      return store.getState();
    },
    actions,
    getState: store.getState,
    subscribe: store.subscribe,
    destroy: store.destroy,
  };
}
