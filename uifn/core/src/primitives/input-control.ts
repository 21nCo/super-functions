import type { UIFnController } from '../controller';
import { createUIFnController } from '../controller';
import { createUIFnError } from '../errors';
import {
  createUIFnEnvironment,
  createUIFnIdAllocator,
  normalizeUIFnIdToken,
  type UIFnEnvironment,
} from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import { focusUIFnPart } from '../internal/runtime/focus';
import { mergePartProps, type UIFnPartEvent, type UIFnPartProps } from '../parts';

export interface UIFnCaret {
  readonly start: number | null;
  readonly end: number | null;
  readonly direction?: 'forward' | 'backward' | 'none';
}

export interface UIFnTextInputProps {
  readonly value?: string;
  readonly defaultValue?: string;
  readonly editing?: boolean;
  readonly defaultEditing?: boolean;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  readonly name?: string;
  readonly form?: string;
  readonly locale?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly precision?: number;
  readonly length?: number;
  readonly mask?: boolean;
  readonly autocomplete?: string;
  readonly inputMode?: string;
  readonly pattern?: string;
  readonly descriptionId?: string;
  readonly errorId?: string;
  readonly validityMessage?: string;
  readonly syncSequence?: number;
  readonly validate?: (value: string) => string | null;
  readonly onValueChange?: (value: string) => void;
  readonly onValueCommit?: (value: string) => void;
  readonly onEditingChange?: (editing: boolean) => void;
  readonly onComplete?: (value: string) => void;
}

export interface UIFnTextInputState {
  readonly primitive: string;
  readonly controlled: boolean;
  readonly secret: boolean;
  readonly value?: string;
  readonly displayValue: string;
  readonly valueLength: number;
  readonly draftValue: string;
  readonly composing: boolean;
  readonly caret: UIFnCaret;
  readonly pendingSequence: number;
  readonly settledSequence: number;
  readonly staleSyncCount: number;
  readonly disabled: boolean;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly name?: string;
  readonly form?: string;
  readonly locale: string;
  readonly editing: boolean;
  readonly visible: boolean;
  readonly autofilled: boolean;
  readonly pasteCount: number;
  readonly numberValue: number | null;
  readonly min?: number;
  readonly max?: number;
  readonly step: number;
  readonly valid: boolean;
  readonly invalid: boolean;
  readonly validityMessage: string;
  readonly completed: boolean;
  readonly ids: Readonly<Record<string, string>>;
  readonly lastErrorCode: string | null;
}

export interface UIFnTextInputActions {
  setValue(value: string, caret?: UIFnCaret): void;
  syncValue(value: string, sequence?: number, caret?: UIFnCaret): void;
  compositionStart(caret?: UIFnCaret): void;
  compositionUpdate(value: string, caret?: UIFnCaret): void;
  compositionEnd(value: string, caret?: UIFnCaret): void;
  paste(value: string, caret?: UIFnCaret): void;
  autofill(value: string): void;
  setCaret(caret: UIFnCaret): void;
  startEditing(): void;
  submit(): void;
  cancel(): void;
  stepBy(delta: number): void;
  increment(): void;
  decrement(): void;
  toggleVisibility(): void;
  clear(): void;
  reset(): void;
  setFieldsetDisabled(disabled: boolean): void;
  getInputValue(): string;
  getFormValue(): Readonly<Record<string, string>>;
}

export interface UIFnInputPart {
  readonly name: string;
  getProps(indexOrProps?: number | UIFnPartProps, userProps?: UIFnPartProps): UIFnPartProps;
}

export interface UIFnTextInputConfig {
  readonly primitive: string;
  readonly slug: string;
  readonly anatomy: readonly string[];
  readonly kind: 'text' | 'editable' | 'number' | 'password' | 'pin';
  readonly secret?: boolean;
}

export type UIFnTextInputController<TParts extends object = Readonly<Record<string, UIFnInputPart>>> = UIFnController<
  UIFnTextInputState,
  UIFnTextInputActions,
  TParts,
  UIFnTextInputProps
>;

function inputEventValue(event?: UIFnPartEvent): string {
  if (typeof event?.value === 'string') return event.value;
  const target = event?.currentTarget as { value?: unknown } | null | undefined;
  return typeof target?.value === 'string' ? target.value : '';
}

function inputEventCaret(event?: UIFnPartEvent): UIFnCaret {
  const target = event?.currentTarget as { selectionStart?: number | null; selectionEnd?: number | null; selectionDirection?: string | null } | null | undefined;
  return Object.freeze({
    start: event?.selectionStart ?? target?.selectionStart ?? null,
    end: event?.selectionEnd ?? target?.selectionEnd ?? null,
    direction: (target?.selectionDirection === 'forward' || target?.selectionDirection === 'backward') ? target.selectionDirection : 'none',
  });
}

function createIds(config: UIFnTextInputConfig, env: UIFnEnvironment): Readonly<Record<string, string>> {
  const resolved = createUIFnEnvironment(env);
  const allocator = createUIFnIdAllocator(resolved, config.primitive);
  const token = resolved.generateId(config.slug);
  return Object.freeze(Object.fromEntries(config.anatomy.map((part) => [part, allocator.fromToken(`${config.slug}-${part}`, token, part)])));
}

function clampNumber(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value));
}

function numberSymbols(locale: string): { decimal: string; group: string; minus: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(-12345.6);
  return {
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
    group: parts.find((part) => part.type === 'group')?.value ?? ',',
    minus: parts.find((part) => part.type === 'minusSign')?.value ?? '-',
  };
}

export function parseUIFnLocaleNumber(value: string, locale = 'en'): number | null {
  const symbols = numberSymbols(locale);
  const normalized = value
    .trim()
    .split(symbols.group).join('')
    .split(symbols.decimal).join('.')
    .split(symbols.minus).join('-')
    .replace(/[\u00a0\u202f\s]/g, '');
  if (!normalized || normalized === '-' || normalized === '.' || normalized === '-.') return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatUIFnLocaleNumber(value: number, locale = 'en', precision?: number): string {
  return new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision ?? 20,
  }).format(value);
}

export function createUIFnTextInputController<TParts extends object = Readonly<Record<string, UIFnInputPart>>>(
  config: UIFnTextInputConfig,
  inputs: UIFnTextInputProps = {},
  env: UIFnEnvironment = {},
): UIFnTextInputController<TParts> {
  const controlled = inputs.value !== undefined;
  const editingControlled = config.kind === 'editable' && inputs.editing !== undefined;
  const secret = config.secret ?? (config.kind === 'password' || config.kind === 'pin');
  const initialRaw = controlled ? inputs.value! : inputs.defaultValue ?? '';
  let rawValue = initialRaw;
  let compositionRaw = initialRaw;
  let editOriginal = initialRaw;
  const ids = createIds(config, env);

  const safeValue = (value: string) => secret ? '•'.repeat(Array.from(value).length) : value;
  const validate = (value: string, required: boolean, locale: string): string => {
    if (required && value.length === 0) return inputs.validityMessage ?? 'A value is required.';
    if (inputs.pattern && !new RegExp(inputs.pattern).test(value)) return inputs.validityMessage ?? 'The value does not match the required format.';
    if (config.kind === 'number' && value && parseUIFnLocaleNumber(value, locale) === null) return inputs.validityMessage ?? 'Enter a valid number.';
    return inputs.validate?.(value) ?? '';
  };
  const stateFor = (base: Omit<UIFnTextInputState, 'value' | 'displayValue' | 'valueLength' | 'numberValue' | 'valid' | 'invalid' | 'validityMessage' | 'completed'>): UIFnTextInputState => {
    const message = validate(rawValue, base.required, base.locale);
    const pinLength = inputs.length ?? 4;
    return Object.freeze({
      ...base,
      value: secret ? undefined : rawValue,
      displayValue: safeValue(rawValue),
      valueLength: Array.from(rawValue).length,
      numberValue: config.kind === 'number' ? parseUIFnLocaleNumber(rawValue, base.locale) : null,
      valid: message.length === 0,
      invalid: message.length > 0,
      validityMessage: message,
      completed: config.kind === 'pin' ? Array.from(rawValue).length === pinLength : false,
    });
  };
  const store = createStateChannel<UIFnTextInputState, string>(stateFor({
    primitive: config.primitive,
    controlled,
    secret,
    draftValue: safeValue(initialRaw),
    composing: false,
    caret: Object.freeze({ start: initialRaw.length, end: initialRaw.length, direction: 'none' }),
    pendingSequence: 0,
    settledSequence: inputs.syncSequence ?? 0,
    staleSyncCount: 0,
    disabled: inputs.disabled ?? false,
    readOnly: inputs.readOnly ?? false,
    required: inputs.required ?? false,
    name: inputs.name,
    form: inputs.form,
    locale: inputs.locale ?? 'en',
    editing: config.kind !== 'editable' || (inputs.editing ?? inputs.defaultEditing ?? false),
    visible: false,
    autofilled: false,
    pasteCount: 0,
    min: inputs.min,
    max: inputs.max,
    step: inputs.step ?? 1,
    ids,
    lastErrorCode: null,
  }));

  const patch = (partial: Partial<UIFnTextInputState>) => store.setState(stateFor({ ...store.getState(), ...partial }));
  const setEditing = (editing: boolean) => {
    if (!editingControlled) patch({ editing });
    inputs.onEditingChange?.(editing);
  };
  const ensureInteractive = () => {
    const state = store.getState();
    if (!state.disabled && !state.readOnly) return true;
    patch({ lastErrorCode: state.disabled ? 'UIFN_ERR_DISABLED_INTERACTION' : null });
    return false;
  };
  const normalizePin = (value: string) => Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character)).slice(0, inputs.length ?? 4).join('');
  const normalize = (value: string) => config.kind === 'pin' ? normalizePin(value) : value;

  const requestValue = (nextValue: string, reason: string, caret?: UIFnCaret) => {
    if (!ensureInteractive()) return;
    const normalized = normalize(nextValue);
    const state = store.getState();
    if (normalized === rawValue && !state.composing) {
      if (caret) patch({ caret });
      return;
    }
    if (controlled) {
      patch({
        draftValue: safeValue(normalized),
        caret: caret ?? state.caret,
        pendingSequence: state.pendingSequence + 1,
        lastErrorCode: null,
      });
    } else {
      rawValue = normalized;
      patch({ draftValue: safeValue(rawValue), caret: caret ?? state.caret, lastErrorCode: null });
    }
    inputs.onValueChange?.(normalized);
    if (config.kind === 'pin' && Array.from(normalized).length === (inputs.length ?? 4)) inputs.onComplete?.(normalized);
    void reason;
  };

  const syncValue = (nextValue: string, sequence = store.getState().pendingSequence, caret?: UIFnCaret) => {
    const state = store.getState();
    if (sequence < state.pendingSequence) {
      patch({ staleSyncCount: state.staleSyncCount + 1, lastErrorCode: 'UIFN_CONTROLLED_UPDATE_STALE' });
      return;
    }
    rawValue = normalize(nextValue);
    patch({
      draftValue: safeValue(rawValue),
      caret: caret ?? state.caret,
      settledSequence: sequence,
      lastErrorCode: null,
    });
  };

  const actions: UIFnTextInputActions = {
    setValue(value, caret) {
      if (store.getState().composing) {
        compositionRaw = normalize(value);
        patch({ draftValue: safeValue(compositionRaw), caret: caret ?? store.getState().caret });
        return;
      }
      requestValue(value, 'input', caret);
    },
    syncValue,
    compositionStart(caret) {
      if (!ensureInteractive()) return;
      compositionRaw = rawValue;
      patch({ composing: true, draftValue: safeValue(compositionRaw), caret: caret ?? store.getState().caret });
    },
    compositionUpdate(value, caret) {
      if (!store.getState().composing) {
        throw createUIFnError({ code: 'UIFN_IME_COMMIT_EARLY', component: config.primitive });
      }
      compositionRaw = normalize(value);
      patch({ draftValue: safeValue(compositionRaw), caret: caret ?? store.getState().caret });
    },
    compositionEnd(value, caret) {
      if (!store.getState().composing) return;
      compositionRaw = normalize(value);
      patch({ composing: false });
      requestValue(compositionRaw, 'composition-end', caret);
    },
    paste(value, caret = store.getState().caret) {
      if (!ensureInteractive()) return;
      const base = store.getState().composing ? compositionRaw : rawValue;
      const start = Math.max(0, caret.start ?? base.length);
      const end = Math.max(start, caret.end ?? start);
      const next = `${base.slice(0, start)}${value}${base.slice(end)}`;
      const nextCaret = Object.freeze({ start: start + value.length, end: start + value.length, direction: 'none' as const });
      patch({ pasteCount: store.getState().pasteCount + 1 });
      if (store.getState().composing) {
        compositionRaw = normalize(next);
        patch({ draftValue: safeValue(compositionRaw), caret: nextCaret });
      } else requestValue(next, 'paste', nextCaret);
    },
    autofill(value) {
      requestValue(value, 'autofill', Object.freeze({ start: value.length, end: value.length, direction: 'none' }));
      patch({ autofilled: true });
    },
    setCaret(caret) {
      patch({ caret });
    },
    startEditing() {
      if (!ensureInteractive()) return;
      editOriginal = rawValue;
      setEditing(true);
    },
    submit() {
      if (store.getState().composing) throw createUIFnError({ code: 'UIFN_IME_COMMIT_EARLY', component: config.primitive });
      if (!store.getState().valid) return;
      setEditing(config.kind !== 'editable');
      inputs.onValueCommit?.(rawValue);
    },
    cancel() {
      if (config.kind !== 'editable') return;
      if (controlled) {
        patch({ composing: false, draftValue: safeValue(rawValue) });
      } else {
        rawValue = editOriginal;
        patch({ composing: false, draftValue: safeValue(rawValue) });
      }
      setEditing(false);
    },
    stepBy(delta) {
      if (!ensureInteractive() || config.kind !== 'number') return;
      const state = store.getState();
      const current = state.numberValue ?? 0;
      const precision = inputs.precision ?? Math.max(0, String(state.step).split('.')[1]?.length ?? 0);
      const next = clampNumber(Number((current + state.step * delta).toFixed(precision)), state.min, state.max);
      requestValue(formatUIFnLocaleNumber(next, state.locale, precision), 'step', state.caret);
    },
    increment() { this.stepBy(1); },
    decrement() { this.stepBy(-1); },
    toggleVisibility() {
      if (config.kind !== 'password') return;
      patch({ visible: !store.getState().visible });
    },
    clear() {
      requestValue('', 'clear', Object.freeze({ start: 0, end: 0, direction: 'none' }));
    },
    reset() {
      const next = inputs.defaultValue ?? '';
      if (controlled) requestValue(next, 'reset', Object.freeze({ start: next.length, end: next.length, direction: 'none' }));
      else {
        rawValue = normalize(next);
        patch({ draftValue: safeValue(rawValue), composing: false, autofilled: false, caret: Object.freeze({ start: rawValue.length, end: rawValue.length, direction: 'none' }) });
      }
    },
    setFieldsetDisabled(disabled) {
      patch({ disabled });
    },
    getInputValue() {
      return rawValue;
    },
    getFormValue() {
      const state = store.getState();
      return Object.freeze(state.name && !state.disabled ? { [state.name]: rawValue } : {});
    },
  };

  const requestPinValueAt = (pinIndex: number, nextInputValue: string, caret?: UIFnCaret) => {
    const nextCharacters = Array.from(normalizePin(nextInputValue));
    const characters = Array.from(rawValue);
    if (nextCharacters.length === 0) {
      characters.splice(pinIndex, 1);
    } else {
      characters.splice(pinIndex, Math.min(1, characters.length - pinIndex), ...nextCharacters);
    }
    const nextValue = normalizePin(characters.join(''));
    const nextCaret = caret ?? Object.freeze({
      start: Math.min(nextValue.length, pinIndex + nextCharacters.length),
      end: Math.min(nextValue.length, pinIndex + nextCharacters.length),
      direction: 'none' as const,
    });
    requestValue(nextValue, 'pin-input', nextCaret);
  };

  const generated = (part: string, index: number | null): UIFnPartProps => {
    const state = store.getState();
    const describedby = [inputs.descriptionId, state.invalid ? (inputs.errorId ?? state.ids.error) : undefined].filter(Boolean).join(' ') || undefined;
    const id = index === null ? state.ids[part] : `${state.ids[part]}-${normalizeUIFnIdToken(String(index))}`;
    const common: UIFnPartProps = { id, data: { state: state.invalid ? 'invalid' : state.editing ? 'editing' : 'idle', disabled: state.disabled, readonly: state.readOnly, composing: state.composing } };
    if (part === 'root') return common;
    if (part === 'label') return common;
    if (part === 'preview') return {
      ...common,
      role: 'button',
      tabIndex: state.disabled ? -1 : 0,
      hidden: state.editing,
      attributes: { type: 'button' },
      on: {
        click: (event) => {
          actions.startEditing();
          focusUIFnPart(event, state.ids.input, { deferred: true });
        },
      },
    };
    if (part === 'input') {
      const pinIndex = index ?? 0;
      const chars = Array.from(rawValue);
      const value = config.kind === 'pin' ? chars[pinIndex] ?? '' : rawValue;
      return {
        ...common,
        tabIndex: state.disabled ? -1 : 0,
        hidden: config.kind === 'editable' ? !state.editing : undefined,
        disabled: state.disabled,
        aria: { labelledby: state.ids.label, describedby, invalid: state.invalid, required: state.required },
        attributes: {
          type: config.kind === 'password' && !state.visible ? 'password' : 'text',
          value,
          name: config.kind === 'editable' || config.kind === 'number' || config.kind === 'pin' ? undefined : state.name,
          form: state.form,
          autocomplete: inputs.autocomplete ?? (config.kind === 'password' ? 'current-password' : config.kind === 'pin' ? 'one-time-code' : 'off'),
          inputmode: inputs.inputMode ?? (config.kind === 'number' ? 'decimal' : config.kind === 'pin' ? 'numeric' : undefined),
          maxlength: config.kind === 'pin' ? 1 : undefined,
        },
        on: {
          input: (event) => {
            if (config.kind === 'pin') requestPinValueAt(pinIndex, inputEventValue(event), inputEventCaret(event));
            else actions.setValue(inputEventValue(event), inputEventCaret(event));
          },
          compositionstart: (event) => actions.compositionStart(inputEventCaret(event)),
          compositionupdate: (event) => actions.compositionUpdate(event?.data ?? inputEventValue(event), inputEventCaret(event)),
          compositionend: (event) => {
            if (config.kind === 'pin' && pinIndex > 0) {
              patch({ composing: false });
              requestPinValueAt(pinIndex, event?.data ?? inputEventValue(event), inputEventCaret(event));
            } else actions.compositionEnd(event?.data ?? inputEventValue(event), inputEventCaret(event));
          },
          select: (event) => actions.setCaret(inputEventCaret(event)),
          paste: (event) => {
            const clipboard = event?.data ?? '';
            if (clipboard) {
              if (config.kind === 'pin') requestPinValueAt(pinIndex, clipboard, inputEventCaret(event));
              else actions.paste(clipboard, inputEventCaret(event));
            }
          },
          change: (event) => {
            if (config.kind === 'pin') requestPinValueAt(pinIndex, inputEventValue(event), inputEventCaret(event));
            else actions.autofill(inputEventValue(event));
          },
        },
      };
    }
    if (part === 'submit' || part === 'cancel' || part === 'increment' || part === 'decrement' || part === 'visibilityTrigger') {
      const operation = part === 'submit' ? () => actions.submit()
        : part === 'cancel' ? () => actions.cancel()
          : part === 'increment' ? () => actions.stepBy(1)
            : part === 'decrement' ? () => actions.stepBy(-1)
              : () => actions.toggleVisibility();
      return {
        ...common,
        role: 'button',
        disabled: state.disabled,
        attributes: { type: 'button' },
        aria: { label: part },
        on: {
          click: (event) => {
            operation();
            if (config.kind === 'editable' && (part === 'submit' || part === 'cancel')) {
              focusUIFnPart(event, state.ids.preview, { deferred: true });
            }
          },
        },
      };
    }
    if (part === 'control') return common;
    if (part === 'hiddenInput') return { ...common, hidden: true, disabled: state.disabled, attributes: { type: 'hidden', name: state.name, value: rawValue, form: state.form } };
    if (part === 'error') return { ...common, role: state.invalid ? 'alert' : undefined, hidden: !state.invalid, aria: { live: 'assertive' } };
    if (part === 'strength') return { ...common, role: 'meter', aria: { label: 'Password strength', valuemin: 0, valuemax: 4, valuenow: Math.min(4, Math.floor(state.valueLength / 4)) } };
    if (part === 'scrubber') {
      const value = state.numberValue ?? 0;
      return {
        ...common,
        role: 'slider',
        tabIndex: state.disabled ? -1 : 0,
        aria: {
          label: 'Adjust value',
          valuemin: state.min,
          valuemax: state.max,
          valuenow: value,
          valuetext: formatUIFnLocaleNumber(value, state.locale),
        },
      };
    }
    return common;
  };

  const parts = Object.fromEntries(config.anatomy.map((part) => [part, {
    name: part,
    getProps(indexOrProps?: number | UIFnPartProps, userProps?: UIFnPartProps) {
      const index = typeof indexOrProps === 'number' ? indexOrProps : null;
      const supplied = typeof indexOrProps === 'number' ? userProps : indexOrProps;
      return mergePartProps(generated(part, index), supplied, { component: config.primitive, part, required: { id: true } });
    },
  }])) as unknown as TParts;

  return createUIFnController({
    actions,
    parts,
    getState: store.getState,
    subscribe: store.subscribe,
    update(next) {
      if (next.value !== undefined) actions.syncValue(next.value, next.syncSequence);
      const patchable: Partial<UIFnTextInputState> = {
        ...(next.disabled !== undefined ? { disabled: next.disabled } : {}),
        ...(next.readOnly !== undefined ? { readOnly: next.readOnly } : {}),
        ...(next.required !== undefined ? { required: next.required } : {}),
        ...(next.name !== undefined ? { name: next.name } : {}),
        ...(next.form !== undefined ? { form: next.form } : {}),
        ...(next.locale !== undefined ? { locale: next.locale } : {}),
        ...(next.min !== undefined ? { min: next.min } : {}),
        ...(next.max !== undefined ? { max: next.max } : {}),
        ...(next.step !== undefined ? { step: next.step } : {}),
      };
      if (Object.keys(patchable).length > 0) patch(patchable);
    },
    destroy: store.destroy,
  });
}
