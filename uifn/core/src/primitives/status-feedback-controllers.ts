import type { UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import { clampRangeValue, formatUIFnValueText } from '../algorithms';
import { createUIFnPartId } from '../algorithms/id';
import { defineUIFnStaticContract, freezeUIFnParts, type UIFnStaticPartProps } from './static-contract';
import {
  createUIFnPhase10Controller,
  createUIFnPhase10Ids,
  createUIFnPhase10Part,
  createUIFnPhase10ValuePart,
  type UIFnPhase10Part,
  type UIFnPhase10ValuePart,
} from './phase10-shared';

export type UIFnStatusTone = 'optimum' | 'suboptimum' | 'critical';
export interface MeterProps { readonly value: number; readonly min?: number; readonly max?: number; readonly low?: number; readonly high?: number; readonly optimum?: number; readonly locale?: string; readonly label?: string; readonly formatValue?: (value: number, locale: string) => string }
export interface MeterState { readonly value: number; readonly min: number; readonly max: number; readonly low: number; readonly high: number; readonly optimum: number; readonly tone: UIFnStatusTone; readonly valueText: string; readonly percent: number }
export interface MeterContractParts { readonly root: UIFnStaticPartProps; readonly label: UIFnStaticPartProps; readonly track: UIFnStaticPartProps; readonly range: UIFnStaticPartProps; readonly valueText: UIFnStaticPartProps }
function meterState(inputs: MeterProps): MeterState { const min = inputs.min ?? 0; const max = inputs.max ?? 100; const value = clampRangeValue(inputs.value, min, max); const low = clampRangeValue(inputs.low ?? min + (max - min) / 3, min, max); const high = clampRangeValue(inputs.high ?? min + (max - min) * 2 / 3, low, max); const optimum = clampRangeValue(inputs.optimum ?? max, min, max); const tone: UIFnStatusTone = optimum < low ? value < low ? 'optimum' : value <= high ? 'suboptimum' : 'critical' : optimum > high ? value > high ? 'optimum' : value >= low ? 'suboptimum' : 'critical' : value >= low && value <= high ? 'optimum' : 'suboptimum'; const locale = inputs.locale ?? 'und'; return Object.freeze({ value, min, max, low, high, optimum, tone, valueText: inputs.formatValue?.(value, locale) ?? formatUIFnValueText(value, {}, locale), percent: max === min ? 0 : (value - min) / (max - min) * 100 }); }
export const MeterContract = defineUIFnStaticContract<MeterProps, MeterState, MeterContractParts>({ kind: 'typed-static-contract', name: 'Meter', anatomy: [{ name: 'root', element: 'div', cardinality: 'one' }, { name: 'label', element: 'span', cardinality: 'one' }, { name: 'track', element: 'div', cardinality: 'one' }, { name: 'range', element: 'div', cardinality: 'one' }, { name: 'valueText', element: 'span', cardinality: 'one' }], getState: meterState, getParts(inputs, context) { const state = meterState(inputs); const root = createUIFnPartId(context.scopeId, 'meter', 'root'); const label = createUIFnPartId(context.scopeId, 'meter', 'label'); const text = createUIFnPartId(context.scopeId, 'meter', 'value-text'); return freezeUIFnParts({ root: { role: 'meter', id: root, aria: { valuemin: state.min, valuemax: state.max, valuenow: state.value, valuetext: state.valueText, labelledby: label, describedby: text }, data: { state: state.tone } }, label: { id: label, data: { value: inputs.label } }, track: { id: createUIFnPartId(context.scopeId, 'meter', 'track') }, range: { id: createUIFnPartId(context.scopeId, 'meter', 'range'), data: { state: state.tone }, style: { width: `${state.percent}%` } }, valueText: { id: text, data: { value: state.valueText } } }); } });
export type MeterContract = typeof MeterContract;

export interface ProgressProps { readonly value?: number | null; readonly defaultValue?: number | null; readonly min?: number; readonly max?: number; readonly error?: boolean; readonly locale?: string; readonly label?: string; readonly formatValue?: (value: number, locale: string) => string; readonly onValueChange?: (value: number | null) => void }
export interface ProgressState { readonly value: number | null; readonly requestedValue?: number | null; readonly min: number; readonly max: number; readonly mode: 'indeterminate' | 'loading' | 'complete' | 'error'; readonly valueText?: string; readonly percent?: number }
export interface ProgressContractParts { readonly root: UIFnStaticPartProps; readonly label: UIFnStaticPartProps; readonly track: UIFnStaticPartProps; readonly range: UIFnStaticPartProps; readonly circle: UIFnStaticPartProps; readonly valueText: UIFnStaticPartProps }
function progressState(inputs: ProgressProps): ProgressState { const min = inputs.min ?? 0; const max = inputs.max ?? 100; const value = inputs.value ?? inputs.defaultValue ?? null; const normalized = value === null ? null : clampRangeValue(value, min, max); const locale = inputs.locale ?? 'und'; const ratio = normalized === null || max === min ? undefined : (normalized - min) / (max - min); return Object.freeze({ value: normalized, min, max, mode: inputs.error ? 'error' : normalized === null ? 'indeterminate' : normalized >= max ? 'complete' : 'loading', valueText: normalized === null ? undefined : inputs.formatValue?.(normalized, locale) ?? formatUIFnValueText(ratio ?? 0, { style: 'percent', maximumFractionDigits: 0 }, locale), percent: ratio === undefined ? undefined : ratio * 100 }); }
export const ProgressContract = defineUIFnStaticContract<ProgressProps, ProgressState, ProgressContractParts>({ kind: 'typed-static-contract', name: 'Progress', anatomy: [{ name: 'root', element: 'div', cardinality: 'one' }, { name: 'label', element: 'span', cardinality: 'one' }, { name: 'track', element: 'div', cardinality: 'one' }, { name: 'range', element: 'div', cardinality: 'one' }, { name: 'circle', element: 'svg', cardinality: 'one' }, { name: 'valueText', element: 'span', cardinality: 'one' }], getState: progressState, getParts(inputs, context) { const state = progressState(inputs); const label = createUIFnPartId(context.scopeId, 'progress', 'label'); const text = createUIFnPartId(context.scopeId, 'progress', 'value-text'); return freezeUIFnParts({ root: { role: 'progressbar', id: createUIFnPartId(context.scopeId, 'progress', 'root'), aria: { valuemin: state.value === null ? undefined : state.min, valuemax: state.value === null ? undefined : state.max, valuenow: state.value ?? undefined, valuetext: state.valueText, labelledby: label, describedby: text }, data: { state: state.mode } }, label: { id: label, data: { value: inputs.label } }, track: { id: createUIFnPartId(context.scopeId, 'progress', 'track') }, range: { id: createUIFnPartId(context.scopeId, 'progress', 'range'), data: { state: state.mode }, style: { width: state.percent === undefined ? undefined : `${state.percent}%` } }, circle: { id: createUIFnPartId(context.scopeId, 'progress', 'circle'), data: { state: state.mode }, attributes: { 'stroke-dashoffset': state.percent === undefined ? undefined : 100 - state.percent } }, valueText: { id: text, data: { value: state.valueText } } }); } });
export type ProgressContract = typeof ProgressContract;
export interface ProgressActions { setValue(value: number | null): void; syncValue(value: number | null): void }
export type ProgressControllerParts = { [K in keyof ProgressContractParts]: UIFnPhase10Part };
export type ProgressController = UIFnController<ProgressState, ProgressActions, ProgressControllerParts, ProgressProps>;
export function createProgressController(props: ProgressProps = {}, env: UIFnEnvironment = {}): ProgressController { const { id } = createUIFnPhase10Ids('Progress', 'progress', env); const contractScope = id('contract'); const controlled = props.value !== undefined; const store = createStateChannel<ProgressState>(progressState(props)); const actions: ProgressActions = { setValue(value) { const next = progressState({ ...props, value }); if (controlled) store.patchState({ requestedValue: next.value }); else store.setState(next); props.onValueChange?.(next.value); }, syncValue(value) { store.setState(progressState({ ...props, value })); } }; const names = ['root', 'label', 'track', 'range', 'circle', 'valueText'] as const; const parts = Object.fromEntries(names.map((name) => [name, createUIFnPhase10Part('Progress', name, () => ({ ...ProgressContract.getParts({ ...props, value: store.getState().value }, { scopeId: contractScope })[name], id: id(name) }), { id: true, role: name === 'root' ? true : undefined, aria: name === 'root' ? ['labelledby'] : undefined })])) as unknown as ProgressControllerParts; return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if ('value' in inputs) actions.syncValue(inputs.value ?? null); } }); }

export type StepStatus = 'upcoming' | 'current' | 'complete' | 'error';
export interface StepsProps { readonly step?: number; readonly defaultStep?: number; readonly count: number; readonly orientation?: 'horizontal' | 'vertical'; readonly linear?: boolean; readonly errors?: readonly number[]; readonly locale?: string; readonly label?: string; readonly onStepChange?: (step: number) => void }
export interface StepsState { readonly step: number; readonly requestedStep?: number; readonly count: number; readonly orientation: 'horizontal' | 'vertical'; readonly linear: boolean; readonly status: 'idle' | 'in-progress' | 'complete'; readonly completed: boolean; readonly statuses: readonly StepStatus[]; readonly announcement?: string }
export interface StepsActions { next(): void; previous(): void; goTo(step: number): void; complete(step?: number): void; syncStep(step: number): void }
export interface StepsControllerParts { readonly root: UIFnPhase10Part; readonly list: UIFnPhase10Part; readonly item: UIFnPhase10ValuePart<number>; readonly trigger: UIFnPhase10ValuePart<number>; readonly indicator: UIFnPhase10ValuePart<number>; readonly separator: UIFnPhase10ValuePart<number>; readonly content: UIFnPhase10ValuePart<number>; readonly completed: UIFnPhase10ValuePart<number> }
export type StepsController = UIFnController<StepsState, StepsActions, StepsControllerParts, StepsProps>;
function stepStatuses(step: number, count: number, errors: readonly number[]): readonly StepStatus[] { return Object.freeze(Array.from({ length: count }, (_, index) => errors.includes(index) ? 'error' : index < step ? 'complete' : index === step ? 'current' : 'upcoming')); }
function equalStepErrors(left: readonly number[], right: readonly number[]): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return leftSet.size === rightSet.size && [...leftSet].every((value) => rightSet.has(value));
}
export function createStepsController(props: StepsProps, env: UIFnEnvironment = {}): StepsController {
  const { resolved, id } = createUIFnPhase10Ids('Steps', 'steps', env);
  let currentProps = props;
  let count = Math.max(1, Math.trunc(props.count));
  let controlled = props.step !== undefined;
  let errors = Object.freeze([...(props.errors ?? [])]);
  let locale = props.locale ?? resolved.getLocale();
  const initial = clampRangeValue(Math.trunc(props.step ?? props.defaultStep ?? 0), 0, count - 1);
  const store = createStateChannel<StepsState>({
    step: initial, count, orientation: props.orientation ?? 'horizontal', linear: props.linear ?? true,
    status: initial === 0 ? 'idle' : 'in-progress', completed: false, statuses: stepStatuses(initial, count, errors),
  });
  const actions: StepsActions = {
    next: () => actions.goTo(store.getState().step + 1),
    previous: () => actions.goTo(store.getState().step - 1),
    goTo(step) {
      const state = store.getState();
      const next = clampRangeValue(Math.trunc(step), 0, count - 1);
      if (state.completed || (state.linear && next > state.step + 1)) return;
      const announcement = new Intl.NumberFormat(locale).format(next + 1);
      if (controlled) store.patchState({ requestedStep: next, announcement });
      else store.patchState({ step: next, requestedStep: undefined, status: next === 0 ? 'idle' : 'in-progress', statuses: stepStatuses(next, count, errors), announcement });
      currentProps.onStepChange?.(next);
    },
    complete(step = store.getState().step) {
      const target = clampRangeValue(Math.trunc(step), 0, count - 1);
      if (errors.includes(target)) return;
      if (target < count - 1) { actions.goTo(target + 1); return; }
      store.patchState({
        step: target, requestedStep: undefined, completed: true, status: 'complete',
        statuses: Object.freeze(Array.from({ length: count }, (_, index) => errors.includes(index) ? 'error' as const : 'complete' as const)),
        announcement: new Intl.NumberFormat(locale).format(count),
      });
    },
    syncStep(step) {
      const next = clampRangeValue(Math.trunc(step), 0, count - 1);
      store.patchState({ step: next, requestedStep: undefined, completed: false, status: next === 0 ? 'idle' : 'in-progress', statuses: stepStatuses(next, count, errors) });
    },
  };
  const status = (index: number) => store.getState().statuses[index] ?? 'upcoming';
  const parts: StepsControllerParts = {
    root: createUIFnPhase10Part('Steps', 'root', () => ({ role: 'navigation', id: id('root'), aria: { label: currentProps.label }, data: { orientation: store.getState().orientation, state: store.getState().status } }), { role: true, id: true }),
    list: createUIFnPhase10Part('Steps', 'list', () => ({ role: 'list', id: id('list') }), { role: true, id: true }),
    item: createUIFnPhase10ValuePart('Steps', 'item', (index) => ({ role: 'listitem', id: id('item', index), aria: { current: status(index) === 'current' ? 'step' : undefined }, data: { state: status(index) } }), { role: true, id: true }),
    trigger: createUIFnPhase10ValuePart('Steps', 'trigger', (index) => ({ role: 'button', id: id('trigger', index), disabled: store.getState().completed || (store.getState().linear && index > store.getState().step + 1), aria: { current: status(index) === 'current' ? 'step' : undefined }, data: { state: status(index) }, on: { click: () => actions.goTo(index) } }), { role: true, id: true }),
    indicator: createUIFnPhase10ValuePart('Steps', 'indicator', (index) => ({ id: id('indicator', index), data: { state: status(index) } }), { id: true }),
    separator: createUIFnPhase10ValuePart('Steps', 'separator', (index) => ({ role: 'separator', id: id('separator', index), data: { state: status(index) } }), { role: true, id: true }),
    content: createUIFnPhase10ValuePart('Steps', 'content', (index) => ({ role: 'region', id: id('content', index), aria: { labelledby: id('trigger', index) }, hidden: store.getState().step !== index || store.getState().completed }), { role: true, id: true }),
    completed: createUIFnPhase10ValuePart('Steps', 'completed', (index) => ({ id: id('completed', index), aria: { hidden: status(index) !== 'complete' }, hidden: status(index) !== 'complete' }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) {
    const previousCount = count;
    const previousErrors = errors;
    const state = store.getState();
    currentProps = { ...currentProps, ...inputs };
    count = Math.max(1, Math.trunc(currentProps.count));
    controlled = currentProps.step !== undefined;
    errors = Object.freeze([...(currentProps.errors ?? [])]);
    locale = currentProps.locale ?? resolved.getLocale();
    const ownerStepProvided = 'step' in inputs && inputs.step !== undefined;
    const ownerStepChanged = ownerStepProvided && Math.trunc(inputs.step!) !== state.step;
    const step = clampRangeValue(
      Math.trunc(ownerStepProvided ? inputs.step! : state.step),
      0,
      count - 1,
    );
    const completed = state.completed && previousCount === count && equalStepErrors(previousErrors, errors) && !ownerStepChanged;
    store.patchState({
      step,
      requestedStep: controlled && !ownerStepProvided && state.requestedStep !== undefined
        ? clampRangeValue(Math.trunc(state.requestedStep), 0, count - 1)
        : undefined,
      count,
      orientation: currentProps.orientation ?? 'horizontal',
      linear: currentProps.linear ?? true,
      status: completed ? 'complete' : step === 0 ? 'idle' : 'in-progress',
      completed,
      statuses: completed
        ? Object.freeze(Array.from({ length: count }, (_, index) => errors.includes(index) ? 'error' as const : 'complete' as const))
        : stepStatuses(step, count, errors),
    });
  } });
}

export type ToastPoliteness = 'polite' | 'assertive';
export interface UIFnToastInput { readonly id: string; readonly title?: string; readonly description?: string; readonly duration?: number | null; readonly politeness?: ToastPoliteness; readonly dedupeKey?: string }
export interface UIFnToastRecord extends UIFnToastInput { readonly status: 'visible' | 'paused' | 'swiping' | 'exiting'; readonly remaining: number | null; readonly createdAt: number; readonly swipeOffset: number }
export interface ToastProps { readonly toasts?: readonly UIFnToastInput[]; readonly limit?: number; readonly duration?: number | null; readonly placement?: string; readonly pauseOnHover?: boolean; readonly pauseOnFocus?: boolean; readonly duplicatePolicy?: 'ignore' | 'replace' | 'allow'; readonly messages?: { readonly dismissed?: string }; readonly onDismiss?: (id: string, reason: string) => void; readonly onRemove?: (id: string) => void; readonly onAnnounce?: (id: string, politeness: ToastPoliteness) => void }
export interface ToastState { readonly visible: readonly UIFnToastRecord[]; readonly queued: readonly UIFnToastInput[]; readonly pauseReasons: readonly string[]; readonly announcements: readonly { readonly id: string; readonly politeness: ToastPoliteness }[]; readonly callbackOrder: readonly string[]; readonly destroyed: boolean }
export interface ToastActions { add(toast: UIFnToastInput): void; update(id: string, patch: Partial<UIFnToastInput>): void; dismiss(id: string, reason?: string): void; remove(id: string): void; pause(reason: string): void; resume(reason: string): void; swipeStart(id: string): void; swipeMove(id: string, offset: number): void; swipeEnd(id: string, threshold?: number): void; swipeCancel(id: string): void; routeChange(): void }
export interface ToastControllerParts { readonly viewport: UIFnPhase10Part; readonly root: UIFnPhase10ValuePart<string>; readonly title: UIFnPhase10ValuePart<string>; readonly description: UIFnPhase10ValuePart<string>; readonly action: UIFnPhase10ValuePart<string>; readonly close: UIFnPhase10ValuePart<string> }
export type ToastController = UIFnController<ToastState, ToastActions, ToastControllerParts, ToastProps>;
function normalizeToastDuration(value: number | null | undefined, fallback: number | null): number | null {
  const candidate = value === undefined ? fallback : value;
  return candidate === null || !Number.isFinite(candidate) ? null : Math.max(0, candidate);
}
function normalizeToastInput(input: UIFnToastInput, fallback: number | null): UIFnToastInput {
  return Object.freeze({ ...input, duration: normalizeToastDuration(input.duration, fallback) });
}
function patchToastInput(input: UIFnToastInput, patch: Partial<UIFnToastInput>, fallback: number | null): UIFnToastInput {
  const definedPatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
  return normalizeToastInput({ ...input, ...definedPatch, id: input.id }, fallback);
}
export function createToastController(props: ToastProps = {}, env: UIFnEnvironment = {}): ToastController {
  const resolved = createUIFnEnvironment(env); const { id } = createUIFnPhase10Ids('Toast', 'toast', env); const limit = Math.max(1, props.limit ?? 3); const duration = normalizeToastDuration(props.duration, 5000); const timers = new Map<string, { handle: unknown; startedAt: number }>();
  const toRecord = (input: UIFnToastInput): UIFnToastRecord => { const toast = normalizeToastInput(input, duration); return Object.freeze({ ...toast, politeness: toast.politeness ?? 'polite', status: 'visible', remaining: toast.duration ?? null, createdAt: resolved.now(), swipeOffset: 0 }); };
  const initial = Object.freeze((props.toasts ?? []).map((toast) => normalizeToastInput(toast, duration)));
  const store = createStateChannel<ToastState>({ visible: Object.freeze(initial.slice(0, limit).map(toRecord)), queued: Object.freeze(initial.slice(limit)), pauseReasons: Object.freeze([]), announcements: Object.freeze([]), callbackOrder: Object.freeze([]), destroyed: false });
  const clearTimer = (toastId: string) => { const timer = timers.get(toastId); if (!timer) return; resolved.scheduler.clearTimeout(timer.handle); timers.delete(toastId); };
  const replaceRecord = (toastId: string, update: (toast: UIFnToastRecord) => UIFnToastRecord) => store.patchState({ visible: Object.freeze(store.getState().visible.map((toast) => toast.id === toastId ? update(toast) : toast)) });
  const schedule = (toast: UIFnToastRecord) => { clearTimer(toast.id); if (toast.remaining === null || toast.remaining <= 0 || store.getState().pauseReasons.length) return; const startedAt = resolved.now(); const handle = resolved.scheduler.setTimeout(() => { timers.delete(toast.id); actions.dismiss(toast.id, 'timeout'); }, toast.remaining); timers.set(toast.id, { handle, startedAt }); };
  const announceToast = (toast: UIFnToastRecord) => { const state = store.getState(); if (state.announcements.some((entry) => entry.id === toast.id)) return; const announcement = { id: toast.id, politeness: toast.politeness ?? 'polite' }; store.patchState({ announcements: Object.freeze([...state.announcements, announcement]) }); props.onAnnounce?.(toast.id, announcement.politeness); };
  const promote = () => { const state = store.getState(); if (state.visible.length >= limit || !state.queued.length) return; const next = toRecord(state.queued[0]); store.patchState({ visible: Object.freeze([...state.visible, next]), queued: Object.freeze(state.queued.slice(1)) }); announceToast(next); schedule(next); };
  const actions: ToastActions = {
    add(input) { const normalized = normalizeToastInput(input, duration); const state = store.getState(); const duplicate = [...state.visible, ...state.queued].find((toast) => (normalized.dedupeKey ?? normalized.id) === (toast.dedupeKey ?? toast.id)); if (duplicate && (props.duplicatePolicy ?? 'ignore') === 'ignore') return; if (duplicate && props.duplicatePolicy === 'replace') { actions.update(duplicate.id, normalized); return; } if (state.visible.length < limit) { const toast = toRecord(normalized); store.patchState({ visible: Object.freeze([...state.visible, toast]) }); announceToast(toast); schedule(toast); } else store.patchState({ queued: Object.freeze([...state.queued, normalized]) }); },
    update(toastId, patch) { const state = store.getState(); if (state.visible.some((toast) => toast.id === toastId)) { replaceRecord(toastId, (toast) => { const next = patchToastInput(toast, patch, duration); const durationChanged = patch.duration !== undefined; return Object.freeze({ ...toast, ...next, id: toast.id, remaining: durationChanged ? next.duration ?? null : toast.remaining }); }); const next = store.getState().visible.find((toast) => toast.id === toastId); if (next) schedule(next); } else store.patchState({ queued: Object.freeze(state.queued.map((toast) => toast.id === toastId ? patchToastInput(toast, patch, duration) : toast)) }); },
    dismiss(toastId, reason = 'programmatic') { if (!store.getState().visible.some((toast) => toast.id === toastId)) { store.patchState({ queued: Object.freeze(store.getState().queued.filter((toast) => toast.id !== toastId)) }); return; } clearTimer(toastId); replaceRecord(toastId, (toast) => Object.freeze({ ...toast, status: 'exiting' })); const state = store.getState(); store.patchState({ callbackOrder: Object.freeze([...state.callbackOrder, `dismiss:${toastId}:${reason}`]) }); props.onDismiss?.(toastId, reason); actions.remove(toastId); },
    remove(toastId) { clearTimer(toastId); const state = store.getState(); if (!state.visible.some((toast) => toast.id === toastId)) return; store.patchState({ visible: Object.freeze(state.visible.filter((toast) => toast.id !== toastId)), callbackOrder: Object.freeze([...state.callbackOrder, `remove:${toastId}`]) }); props.onRemove?.(toastId); promote(); },
    pause(reason) { const state = store.getState(); if (state.pauseReasons.includes(reason)) return; for (const toast of state.visible) { const timer = timers.get(toast.id); if (timer && toast.remaining !== null) { const remaining = Math.max(0, toast.remaining - (resolved.now() - timer.startedAt)); clearTimer(toast.id); replaceRecord(toast.id, (current) => Object.freeze({ ...current, remaining, status: 'paused' })); } } store.patchState({ pauseReasons: Object.freeze([...store.getState().pauseReasons, reason]) }); },
    resume(reason) { const state = store.getState(); const pauseReasons = Object.freeze(state.pauseReasons.filter((entry) => entry !== reason)); store.patchState({ pauseReasons, visible: Object.freeze(state.visible.map((toast) => Object.freeze({ ...toast, status: pauseReasons.length ? 'paused' : 'visible' }))) }); if (!pauseReasons.length) store.getState().visible.forEach(schedule); },
    swipeStart(toastId) { replaceRecord(toastId, (toast) => Object.freeze({ ...toast, status: 'swiping' })); },
    swipeMove(toastId, offset) { replaceRecord(toastId, (toast) => Object.freeze({ ...toast, status: 'swiping', swipeOffset: offset })); },
    swipeEnd(toastId, threshold = 40) { const toast = store.getState().visible.find((entry) => entry.id === toastId); if (!toast) return; if (Math.abs(toast.swipeOffset) >= threshold) actions.dismiss(toastId, 'swipe'); else actions.swipeCancel(toastId); },
    swipeCancel(toastId) { replaceRecord(toastId, (toast) => Object.freeze({ ...toast, status: store.getState().pauseReasons.length ? 'paused' : 'visible', swipeOffset: 0 })); },
    routeChange() { const visible = [...store.getState().visible]; store.patchState({ queued: Object.freeze([]) }); visible.forEach((toast) => actions.dismiss(toast.id, 'route-change')); },
  };
  const get = (toastId: string) => store.getState().visible.find((toast) => toast.id === toastId);
  const parts: ToastControllerParts = {
    viewport: createUIFnPhase10Part('Toast', 'viewport', () => ({ role: 'region', id: id('viewport'), aria: { live: 'off' }, data: { placement: props.placement ?? 'bottom-end', state: store.getState().pauseReasons.length ? 'paused' : 'active' }, on: { pointerenter: () => props.pauseOnHover !== false && actions.pause('hover'), pointerleave: () => props.pauseOnHover !== false && actions.resume('hover'), focus: () => props.pauseOnFocus !== false && actions.pause('focus'), blur: () => props.pauseOnFocus !== false && actions.resume('focus') } }), { role: true, id: true }),
    root: createUIFnPhase10ValuePart('Toast', 'root', (toastId) => ({ role: get(toastId)?.politeness === 'assertive' ? 'alert' : 'status', id: id('root', toastId), tabIndex: 0, aria: { labelledby: id('title', toastId), describedby: id('description', toastId) }, data: { state: get(toastId)?.status, swipe: get(toastId)?.swipeOffset }, style: { transform: `translateX(${get(toastId)?.swipeOffset ?? 0}px)` } }), { role: true, id: true, tabIndex: true }),
    title: createUIFnPhase10ValuePart('Toast', 'title', (toastId) => ({ id: id('title', toastId), data: { value: get(toastId)?.title } }), { id: true }),
    description: createUIFnPhase10ValuePart('Toast', 'description', (toastId) => ({ id: id('description', toastId), data: { value: get(toastId)?.description } }), { id: true }),
    action: createUIFnPhase10ValuePart('Toast', 'action', (toastId) => ({ role: 'button', id: id('action', toastId), data: { toastId } }), { role: true, id: true }),
    close: createUIFnPhase10ValuePart('Toast', 'close', (toastId) => ({
      role: 'button',
      id: id('close', toastId),
      aria: {
        controls: id('root', toastId),
        label: props.messages?.dismissed ?? 'Dismiss notification',
      },
      on: { click: () => actions.dismiss(toastId, 'close') },
    }), { role: true, id: true, aria: ['controls', 'label'] }),
  };
  store.getState().visible.forEach((toast) => { announceToast(toast); schedule(toast); });
  return createUIFnPhase10Controller({ store, actions, parts, env, destroy() { timers.forEach((timer) => resolved.scheduler.clearTimeout(timer.handle)); timers.clear(); store.patchState({ destroyed: true }); } });
}

export function assertUIFnAnnouncementBudget(actual: number, maximum: number): void { if (actual <= maximum) return; const error = new Error('UIFN_ANNOUNCEMENT_FLOOD') as Error & { code: string }; error.code = 'UIFN_ANNOUNCEMENT_FLOOD'; throw error; }
export function assertUIFnNoTimerAfterDestroy(callbacks: number): void { if (callbacks === 0) return; const error = new Error('UIFN_TIMER_AFTER_DESTROY') as Error & { code: string }; error.code = 'UIFN_TIMER_AFTER_DESTROY'; throw error; }
