import { createStateChannel } from '../internal/runtime/state-channel';
import { createUIFnError, type UIFnError } from '../errors';
import { createControlledValue } from '../internal/runtime/controlled';
import { createListCollection } from '../algorithms/collection';
import { getNextCollectionKey } from '../algorithms/navigation';
import { type ChangeMeta, shallowArrayEqual, uniqueStrings } from './shared';

export type AccordionType = 'single' | 'multiple';

export interface AccordionProps {
  type?: AccordionType;
  value?: string | string[];
  defaultValue?: string | string[];
  collapsible?: boolean;
  disabled?: boolean;
  orientation?: 'horizontal' | 'vertical';
  items?: string[];
  onValueChange?: (value: string | string[]) => void;
}

export interface AccordionState {
  value: string | string[];
  type: AccordionType;
  collapsible: boolean;
  controlled: boolean;
  disabled: boolean;
  orientation: 'horizontal' | 'vertical';
  items: string[];
  focusedItem: string | null;
  lastChangeMeta?: ChangeMeta<string | string[]>;
  lastError: UIFnError | null;
}

export interface AccordionActions {
  setValue: (value: string | string[]) => void;
  toggleItem: (itemValue: string) => void;
  setItems: (items: string[]) => void;
  registerItem: (itemValue: string) => void;
  unregisterItem: (itemValue: string) => void;
  focusItem: (itemValue: string) => void;
  handleKeyDown: (key: string, currentItem: string) => string | null;
  syncValue: (value: string | string[]) => void;
}

export interface AccordionRuntime {
  readonly state: AccordionState;
  readonly actions: AccordionActions;
  getState: () => AccordionState;
  subscribe: (
    callback: (state: AccordionState, meta?: ChangeMeta<string | string[]>) => void
  ) => () => void;
  destroy: () => void;
}

function normalizeAccordionValue(value: string | string[] | undefined, type: AccordionType): string | string[] {
  if (type === 'single') {
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }

    return value ?? '';
  }

  if (Array.isArray(value)) {
    return uniqueStrings(value);
  }

  return value ? [value] : [];
}

function validateAccordionValue(
  value: string | string[],
  items: string[],
  type: AccordionType
): void {
  if (items.length === 0) {
    return;
  }

  const invalidValues =
    type === 'single'
      ? typeof value === 'string' && value !== '' && !items.includes(value)
        ? [value]
        : []
      : (value as string[]).filter((entry) => !items.includes(entry));

  if (invalidValues.length > 0) {
    throw createUIFnError({
      code: 'UIFN_ERR_INVALID_VALUE',
      package: '@uifn/core',
      component: 'Accordion',
      message: 'Invalid external values MUST be handled deterministically.',
      details: {
        invalidValues,
        items,
      },
    });
  }
}

export function createAccordionRuntime(props: AccordionProps): AccordionRuntime {
  const type = props.type ?? 'single';
  const collapsible = props.collapsible ?? false;
  const disabled = props.disabled ?? false;
  const orientation = props.orientation ?? 'vertical';
  const items = [...createListCollection({ items: props.items ?? [], getKey: (item) => item }).keys];
  const initialValue = normalizeAccordionValue(
    props.value ?? props.defaultValue,
    type
  );
  const controlledState = createControlledValue<string | string[]>({
    value: props.value === undefined ? undefined : normalizeAccordionValue(props.value, type),
    defaultValue: normalizeAccordionValue(props.defaultValue, type),
    onChange: props.onValueChange,
    isEqual:
      type === 'single'
        ? (a, b) => a === b
        : (a, b) => shallowArrayEqual(a as string[], b as string[]),
  });

  validateAccordionValue(initialValue, items, type);

  const store = createStateChannel<AccordionState, string | string[]>({
    value: controlledState.getValue(),
    type,
    collapsible,
    controlled: controlledState.isControlled(),
    disabled,
    orientation,
    items,
    focusedItem: items[0] ?? null,
    lastError: null,
  });

  const emitValue = (
    nextValue: string | string[],
    meta: ChangeMeta<string | string[]>
  ) => {
    const state = store.getState();
    validateAccordionValue(nextValue, state.items, type);
    const result =
      meta.source === 'controlled-sync'
        ? controlledState.syncValue(nextValue)
        : controlledState.requestValue(nextValue);
    store.patchState(
      {
        value: result.value,
        lastChangeMeta: meta,
        lastError: null,
      },
      meta
    );
  };

  const actions: AccordionActions = {
    setValue(nextValue) {
      const state = store.getState();
      const normalized = normalizeAccordionValue(nextValue, type);
      const noChange =
        type === 'single'
          ? state.value === normalized
          : shallowArrayEqual(state.value as string[], normalized as string[]);

      if (noChange) {
        return;
      }

      emitValue(normalized, {
        source: 'programmatic',
        reason: 'set-value',
        previousValue: state.value,
        nextValue: normalized,
      });
    },
    toggleItem(itemValue) {
      const state = store.getState();
      if (state.disabled) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_DISABLED_INTERACTION',
            package: '@uifn/core',
            component: 'Accordion',
            message: 'Disabled controls MUST ignore state-changing input.',
            recoverable: true,
          }),
        });
        return;
      }

      if (type === 'single') {
        const currentValue = state.value as string;
        const nextValue =
          currentValue === itemValue
            ? collapsible
              ? ''
              : currentValue
            : itemValue;

        if (nextValue === currentValue) {
          return;
        }

        emitValue(nextValue, {
          source: 'user',
          reason: 'toggle-item',
          previousValue: currentValue,
          nextValue,
          inputModality: 'pointer',
        });
        return;
      }

      const currentValues = state.value as string[];
      const nextValue = currentValues.includes(itemValue)
        ? currentValues.filter((value) => value !== itemValue)
        : [...currentValues, itemValue];

      if (shallowArrayEqual(currentValues, nextValue)) {
        return;
      }

      emitValue(nextValue, {
        source: 'user',
        reason: 'toggle-item',
        previousValue: currentValues,
        nextValue,
        inputModality: 'pointer',
      });
    },
    setItems(nextInput) {
      const state = store.getState();
      const nextItems = [...createListCollection({ items: nextInput, getKey: (item) => item }).keys];
      const nextFocusedItem = state.focusedItem && nextItems.includes(state.focusedItem)
        ? state.focusedItem
        : nextItems[0] ?? null;
      const nextValue = type === 'single'
        ? (typeof state.value === 'string' && nextItems.includes(state.value) ? state.value : '')
        : (state.value as string[]).filter((value) => nextItems.includes(value));
      if (
        (type === 'single' && nextValue !== state.value)
        || (type === 'multiple' && !shallowArrayEqual(nextValue as string[], state.value as string[]))
      ) controlledState.syncValue(nextValue);
      store.patchState({
        items: nextItems,
        focusedItem: nextFocusedItem,
        value: nextValue,
        lastError: null,
      });
    },
    registerItem(itemValue) {
      const state = store.getState();
      if (state.items.includes(itemValue)) {
        return;
      }

      const nextItems = [...state.items, itemValue];
      validateAccordionValue(state.value, nextItems, type);
      store.patchState({
        items: nextItems,
        focusedItem: state.focusedItem ?? itemValue,
        lastError: null,
      });
    },
    unregisterItem(itemValue) {
      const state = store.getState();
      const nextItems = state.items.filter((value) => value !== itemValue);
      const nextFocusedItem =
        state.focusedItem === itemValue ? nextItems[0] ?? null : state.focusedItem;

      let nextValue = state.value;
      if (type === 'single') {
        if (state.value === itemValue) {
          nextValue = '';
        }
      } else {
        nextValue = (state.value as string[]).filter((value) => value !== itemValue);
      }

      if (
        (type === 'single' && nextValue !== state.value) ||
        (type === 'multiple' &&
          !shallowArrayEqual(nextValue as string[], state.value as string[]))
      ) {
        controlledState.syncValue(nextValue);
      }

      store.patchState({
        items: nextItems,
        focusedItem: nextFocusedItem,
        value: nextValue,
      });
    },
    focusItem(itemValue) {
      const state = store.getState();
      if (!state.items.includes(itemValue)) {
        return;
      }

      store.patchState({
        focusedItem: itemValue,
      });
    },
    handleKeyDown(key, currentItem) {
      const state = store.getState();
      if (state.items.length === 0) {
        return null;
      }

      const collection = createListCollection({ items: state.items, getKey: (item) => item });
      const nextItem = getNextCollectionKey({
        collection,
        key,
        currentKey: currentItem,
        orientation: orientation,
      });
      if (!nextItem || nextItem === currentItem) {
        return null;
      }

      store.patchState({
        focusedItem: nextItem,
        lastChangeMeta: {
          source: 'user',
          reason: 'keyboard-navigation',
          previousValue: state.value,
          nextValue: state.value,
          inputModality: 'keyboard',
        },
      });
      return nextItem;
    },
    syncValue(value) {
      const state = store.getState();
      const normalized = normalizeAccordionValue(value, type);
      const noChange =
        type === 'single'
          ? state.value === normalized
          : shallowArrayEqual(state.value as string[], normalized as string[]);

      if (noChange) {
        return;
      }

      emitValue(normalized, {
        source: 'controlled-sync',
        reason: 'sync-value',
        previousValue: state.value,
        nextValue: normalized,
      });
    },
  };

  return {
    get state() {
      return store.getState();
    },
    actions,
    getState: store.getState,
    subscribe: store.subscribe,
    destroy() {
      controlledState.destroy();
      store.destroy();
    },
  };
}
