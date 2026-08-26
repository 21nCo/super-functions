import { createStateChannel } from '../internal/runtime/state-channel';
import { createUIFnError, type UIFnError } from '../errors';
import { K } from '../aria/keys';
import { createControlledValue } from '../internal/runtime/controlled';
import { type ChangeMeta } from './shared';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  required?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  onCheckedChange?: (checked: boolean) => void;
}

export interface SwitchState {
  checked: boolean;
  controlled: boolean;
  disabled: boolean;
  required: boolean;
  name?: string;
  value: string;
  ariaChecked: 'true' | 'false';
  pressed: boolean;
  formValue: Record<string, string>;
  lastChangeMeta?: ChangeMeta<boolean>;
  lastError: UIFnError | null;
}

export interface SwitchActions {
  setChecked: (checked: boolean) => void;
  toggle: () => void;
  handleKeyDown: (key: string) => void;
  syncChecked: (checked: boolean) => void;
  getFormValue: () => Record<string, string>;
}

export interface SwitchRuntime {
  readonly state: SwitchState;
  readonly actions: SwitchActions;
  getState: () => SwitchState;
  subscribe: (callback: (state: SwitchState, meta?: ChangeMeta<boolean>) => void) => () => void;
  destroy: () => void;
}

function getFormValue(name: string | undefined, value: string, checked: boolean): Record<string, string> {
  if (!name || !checked) {
    return {};
  }

  return {
    [name]: value,
  };
}

export function createSwitchRuntime(props: SwitchProps): SwitchRuntime {
  const initialChecked = props.checked ?? props.defaultChecked ?? false;
  const disabled = props.disabled ?? false;
  const required = props.required ?? false;
  const value = props.value ?? 'on';
  const name = props.name;
  const controlledState = createControlledValue<boolean>({
    value: props.checked,
    defaultValue: props.defaultChecked ?? false,
    onChange: props.onCheckedChange,
  });

  const store = createStateChannel<SwitchState, boolean>({
    checked: controlledState.getValue(),
    controlled: controlledState.isControlled(),
    disabled,
    required,
    name,
    value,
    ariaChecked: controlledState.getValue() ? 'true' : 'false',
    pressed: controlledState.getValue(),
    formValue: getFormValue(name, value, controlledState.getValue()),
    lastError: null,
  });

  const emitChecked = (nextChecked: boolean, meta: ChangeMeta<boolean>) => {
    const result =
      meta.source === 'controlled-sync'
        ? controlledState.syncValue(nextChecked)
        : controlledState.requestValue(nextChecked);
    store.patchState(
      {
        checked: result.value,
        ariaChecked: result.value ? 'true' : 'false',
        pressed: result.value,
        formValue: getFormValue(name, value, result.value),
        lastChangeMeta: meta,
        lastError: null,
      },
      meta
    );
  };

  const ensureEnabled = (): boolean => {
    const state = store.getState();
    if (!state.disabled) {
      return true;
    }

    store.patchState({
      lastError: createUIFnError({
        code: 'UIFN_ERR_DISABLED_INTERACTION',
        package: '@uifn/core',
        component: 'Switch',
        message: 'Disabled controls MUST ignore state-changing input.',
        recoverable: true,
      }),
    });
    return false;
  };

  const actions: SwitchActions = {
    setChecked(checked) {
      if (!ensureEnabled()) {
        return;
      }

      const state = store.getState();
      if (state.checked === checked) {
        return;
      }
      emitChecked(checked, {
        source: 'programmatic',
        reason: 'set-checked',
        previousValue: state.checked,
        nextValue: checked,
      });
    },
    toggle() {
      if (!ensureEnabled()) {
        return;
      }

      const state = store.getState();
      const nextChecked = !state.checked;
      emitChecked(nextChecked, {
        source: 'user',
        reason: 'toggle',
        previousValue: state.checked,
        nextValue: nextChecked,
        inputModality: 'pointer',
      });
    },
    handleKeyDown(key) {
      if (key !== K.SPACE) {
        return;
      }

      if (!ensureEnabled()) {
        return;
      }

      const state = store.getState();
      const nextChecked = !state.checked;
      emitChecked(nextChecked, {
        source: 'user',
        reason: 'keyboard-toggle',
        previousValue: state.checked,
        nextValue: nextChecked,
        inputModality: 'keyboard',
      });
    },
    syncChecked(checked) {
      const state = store.getState();
      if (state.checked === checked) {
        return;
      }

      emitChecked(checked, {
        source: 'controlled-sync',
        reason: 'sync-checked',
        previousValue: state.checked,
        nextValue: checked,
      });
    },
    getFormValue() {
      return store.getState().formValue;
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
