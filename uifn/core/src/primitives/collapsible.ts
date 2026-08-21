import { createStateChannel } from '../internal/runtime/state-channel';
import { createUIFnError, type UIFnError } from '../errors';
import { createControlledValue } from '../internal/runtime/controlled';
import { type ChangeMeta } from './shared';

export interface CollapsibleProps {
  open?: boolean;
  defaultOpen?: boolean;
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export interface CollapsibleState {
  open: boolean;
  controlled: boolean;
  disabled: boolean;
  lastChangeMeta?: ChangeMeta<boolean>;
  lastError: UIFnError | null;
}

export interface CollapsibleActions {
  setOpen: (open: boolean) => void;
  toggle: () => void;
  syncOpen: (open: boolean) => void;
}

export interface CollapsibleRuntime {
  readonly state: CollapsibleState;
  readonly actions: CollapsibleActions;
  getState: () => CollapsibleState;
  subscribe: (callback: (state: CollapsibleState, meta?: ChangeMeta<boolean>) => void) => () => void;
  destroy: () => void;
}

export function createCollapsibleRuntime(props: CollapsibleProps = {}): CollapsibleRuntime {
  const initialOpen = props.open ?? props.defaultOpen ?? false;
  const disabled = props.disabled ?? false;
  const controlledState = createControlledValue({
    value: props.open,
    defaultValue: props.defaultOpen ?? false,
    onChange: props.onOpenChange,
  });
  const store = createStateChannel<CollapsibleState, boolean>({
    open: controlledState.getValue(),
    controlled: controlledState.isControlled(),
    disabled,
    lastError: null,
  });

  const emitOpen = (nextOpen: boolean, meta: ChangeMeta<boolean>) => {
    const result =
      meta.source === 'controlled-sync'
        ? controlledState.syncValue(nextOpen)
        : controlledState.requestValue(nextOpen);
    store.patchState(
      {
        open: result.value,
        lastChangeMeta: meta,
        lastError: null,
      },
      meta
    );
  };

  const actions: CollapsibleActions = {
    setOpen(open) {
      const state = store.getState();
      if (state.open === open) {
        return;
      }

      if (state.disabled) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_DISABLED_INTERACTION',
            package: '@uifn/core',
            component: 'Collapsible',
            message: 'Disabled controls MUST ignore state-changing input.',
            recoverable: true,
          }),
        });
        return;
      }

      emitOpen(open, {
        source: 'programmatic',
        reason: 'set-open',
        previousValue: state.open,
        nextValue: open,
      });
    },
    toggle() {
      const state = store.getState();
      if (state.disabled) {
        store.patchState({
          lastError: createUIFnError({
            code: 'UIFN_ERR_DISABLED_INTERACTION',
            package: '@uifn/core',
            component: 'Collapsible',
            message: 'Disabled controls MUST ignore state-changing input.',
            recoverable: true,
          }),
        });
        return;
      }

      const nextOpen = !state.open;
      emitOpen(nextOpen, {
        source: 'user',
        reason: 'toggle',
        previousValue: state.open,
        nextValue: nextOpen,
        inputModality: 'pointer',
      });
    },
    syncOpen(open) {
      const state = store.getState();
      if (state.open === open) {
        return;
      }

      emitOpen(open, {
        source: 'controlled-sync',
        reason: 'sync-open',
        previousValue: state.open,
        nextValue: open,
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

export type CollapsibleTestEvent =
  | { type: 'TOGGLE' }
  | { type: 'OPEN' }
  | { type: 'CLOSE' };

export function createCollapsibleTestHarness(initialOpen = false, initialDisabled = false) {
  const machine = createCollapsibleRuntime({
    defaultOpen: initialOpen,
    disabled: initialDisabled,
  });

  return {
    get state() {
      return machine.state.open ? 'open' : 'closed';
    },
    send(event: CollapsibleTestEvent) {
      if (event.type === 'TOGGLE') {
        machine.actions.toggle();
      } else if (event.type === 'OPEN') {
        machine.actions.setOpen(true);
      } else {
        machine.actions.setOpen(false);
      }
    },
    subscribe: machine.subscribe,
  };
}
