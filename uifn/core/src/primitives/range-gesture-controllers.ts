import type { UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import type { UIFnPartProps } from '../parts';
import {
  alignRangeValue,
  assertUIFnGestureInactive,
  closestUIFnThumb,
  constrainUIFnThumbValue,
  formatUIFnValueText,
  rangePercentToValue,
  rangeValueToPercent,
  resizeUIFnSplitterPair,
  resolveUIFnCarouselIndex,
  resolveUIFnTouchArbitration,
  stepUIFnRangeValue,
  type UIFnAxis,
  type UIFnGestureDirection,
  type UIFnPoint,
  type UIFnPointerKind,
} from '../algorithms';
import {
  createUIFnPhase10Controller,
  createUIFnPhase10Ids,
  createUIFnPhase10Part,
  createUIFnPhase10ValuePart,
  formatUIFnLocalizedNumber,
  type UIFnPhase10Part,
  type UIFnPhase10ValuePart,
} from './phase10-shared';

interface PointerRecord { readonly start: UIFnPoint; readonly current: UIFnPoint; readonly kind: UIFnPointerKind; readonly target: number }
type PointerMap = Readonly<Record<string, PointerRecord>>;

function setPointer(pointers: PointerMap, id: number, value: PointerRecord): PointerMap { return Object.freeze({ ...pointers, [id]: value }); }
function removePointer(pointers: PointerMap, id: number): PointerMap { const next = { ...pointers }; delete next[id]; return Object.freeze(next); }
function point(value: number): UIFnPoint { return { x: value, y: value }; }
function phase(pointers: PointerMap): 'idle' | 'dragging' { return Object.keys(pointers).length ? 'dragging' : 'idle'; }

function announce(
  previousAt: number,
  now: number,
  message: string,
  force = false,
): { readonly at: number; readonly message?: string } {
  return force || now - previousAt >= 150 ? { at: now, message } : { at: previousAt };
}

export interface SliderProps {
  readonly value?: readonly number[]; readonly defaultValue?: readonly number[]; readonly min?: number; readonly max?: number; readonly step?: number;
  readonly minStepsBetweenThumbs?: number; readonly orientation?: UIFnAxis; readonly dir?: UIFnGestureDirection; readonly locale?: string;
  readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly onValueChange?: (value: readonly number[]) => void;
}
export interface SliderState {
  readonly value: readonly number[]; readonly requestedValue?: readonly number[]; readonly min: number; readonly max: number; readonly step: number;
  readonly minStepsBetweenThumbs: number; readonly orientation: UIFnAxis; readonly dir: UIFnGestureDirection; readonly locale: string;
  readonly disabled: boolean; readonly readOnly: boolean; readonly activeThumb: number; readonly pointers: PointerMap;
  readonly interaction: 'idle' | 'dragging'; readonly cancelledPointers: readonly number[]; readonly valueText: readonly string[];
  readonly announcement?: string; readonly announcementCount: number; readonly announcementAt: number;
}
export interface SliderActions {
  setValue(value: readonly number[]): void; syncValue(value: readonly number[]): void; setThumbValue(index: number, value: number, modality?: 'keyboard' | 'pointer' | 'touch'): void;
  keyStep(index: number, key: string): void; setActiveThumb(index: number): void;
  pointerStart(id: number, percent: number, kind?: UIFnPointerKind): void; pointerMove(id: number, percent: number, current?: UIFnPoint): void;
  pointerEnd(id: number): void; pointerCancel(id: number): void; lostPointerCapture(id: number): void; reset(): void;
}
export interface SliderControllerParts {
  readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly control: UIFnPhase10Part; readonly track: UIFnPhase10Part;
  readonly range: UIFnPhase10Part; readonly thumb: UIFnPhase10ValuePart<number>; readonly valueText: UIFnPhase10ValuePart<number>; readonly hiddenInput: UIFnPhase10ValuePart<number>;
}
export type SliderController = UIFnController<SliderState, SliderActions, SliderControllerParts, SliderProps>;

function normalizeSliderValues(values: readonly number[], min: number, max: number, step: number, minSteps: number): readonly number[] {
  const sorted = (values.length ? values : [min]).map((value) => alignRangeValue(value, { min, max, step })).sort((a, b) => a - b);
  const next = [...sorted];
  const gap = minSteps * step;
  for (let index = 1; index < next.length; index += 1) next[index] = Math.max(next[index], next[index - 1] + gap);
  if (next.at(-1)! > max) {
    next[next.length - 1] = max;
    for (let index = next.length - 2; index >= 0; index -= 1) next[index] = Math.min(next[index], next[index + 1] - gap);
  }
  if (next[0] < min) {
    next[0] = min;
    for (let index = 1; index < next.length; index += 1) next[index] = Math.max(next[index], next[index - 1] + gap);
  }
  return Object.freeze(next.map((value) => alignRangeValue(value, { min, max, step })));
}

export function createSliderController(props: SliderProps = {}, env: UIFnEnvironment = {}): SliderController {
  const { resolved, id } = createUIFnPhase10Ids('Slider', 'slider', env); let currentProps = props; let min = props.min ?? 0; let max = props.max ?? 100; let step = props.step ?? 1;
  let minSteps = Math.max(0, props.minStepsBetweenThumbs ?? 0); let controlled = props.value !== undefined; const initial = normalizeSliderValues(props.value ?? props.defaultValue ?? [min], min, max, step, minSteps);
  let locale = props.locale ?? resolved.getLocale(); let format = (value: number) => formatUIFnValueText(value, { maximumFractionDigits: 12 }, locale);
  const store = createStateChannel<SliderState>({ value: initial, min, max, step, minStepsBetweenThumbs: minSteps, orientation: props.orientation ?? 'horizontal', dir: props.dir ?? resolved.getDirection(), locale, disabled: props.disabled ?? false, readOnly: props.readOnly ?? false, activeThumb: 0, pointers: Object.freeze({}), interaction: 'idle', cancelledPointers: Object.freeze([]), valueText: Object.freeze(initial.map(format)), announcementCount: 0, announcementAt: -1_000_000_000_000 });
  const commit = (nextValue: readonly number[], modality: 'keyboard' | 'pointer' | 'touch' | 'programmatic', forceAnnouncement = false) => {
    const state = store.getState(); if (state.disabled || state.readOnly) return;
    const normalized = normalizeSliderValues(nextValue, min, max, step, minSteps); const message = normalized.map(format).join(' – '); const result = announce(state.announcementAt, resolved.now(), message, forceAnnouncement);
    if (controlled) store.patchState({ requestedValue: normalized, announcement: result.message ?? state.announcement, announcementAt: result.at, announcementCount: state.announcementCount + (result.message ? 1 : 0) });
    else store.patchState({ value: normalized, valueText: Object.freeze(normalized.map(format)), requestedValue: undefined, announcement: result.message ?? state.announcement, announcementAt: result.at, announcementCount: state.announcementCount + (result.message ? 1 : 0) });
    currentProps.onValueChange?.(normalized);
  };
  const actions: SliderActions = {
    setValue: (value) => commit(value, 'programmatic'),
    syncValue(value) { const normalized = normalizeSliderValues(value, min, max, step, minSteps); store.patchState({ value: normalized, valueText: Object.freeze(normalized.map(format)), requestedValue: undefined }); },
    setThumbValue(index, value, modality = 'pointer') { const state = store.getState(); const next = constrainUIFnThumbValue(state.value, index, value, { min, max, step }, minSteps); store.patchState({ activeThumb: index }); commit(next, modality, modality === 'keyboard'); },
    keyStep(index, key) { const state = store.getState(); const current = state.value[index]; if (current === undefined) return; actions.setThumbValue(index, stepUIFnRangeValue(current, key, { min, max, step }, { orientation: state.orientation, direction: state.dir }), 'keyboard'); },
    setActiveThumb(index) { if (index >= 0 && index < store.getState().value.length) store.patchState({ activeThumb: index }); },
    pointerStart(pointerId, percent, kind = 'mouse') { const state = store.getState(); if (state.disabled || state.readOnly) return; const value = rangePercentToValue(percent, { min, max, step }); const target = closestUIFnThumb(state.value, value); const start = point(percent); store.patchState({ activeThumb: target, pointers: setPointer(state.pointers, pointerId, { start, current: start, kind, target }), interaction: 'dragging' }); actions.setThumbValue(target, value, kind === 'touch' ? 'touch' : 'pointer'); },
    pointerMove(pointerId, percent, current = point(percent)) { const state = store.getState(); const pointer = state.pointers[pointerId]; if (!pointer) return; if (pointer.kind === 'touch') { const arbitration = resolveUIFnTouchArbitration(pointer.start, current, state.orientation); if (arbitration === 'pending') return; if (arbitration === 'scroll') { actions.pointerCancel(pointerId); return; } } const pointers = setPointer(state.pointers, pointerId, { ...pointer, current }); store.patchState({ pointers }); actions.setThumbValue(pointer.target, rangePercentToValue(percent, { min, max, step }), pointer.kind === 'touch' ? 'touch' : 'pointer'); },
    pointerEnd(pointerId) { const state = store.getState(); if (!state.pointers[pointerId]) return; const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, interaction: phase(pointers) }); },
    pointerCancel(pointerId) { const state = store.getState(); if (!state.pointers[pointerId]) return; const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, interaction: phase(pointers), cancelledPointers: Object.freeze([...state.cancelledPointers, pointerId]) }); },
    lostPointerCapture: (pointerId) => actions.pointerCancel(pointerId),
    reset: () => actions.syncValue(currentProps.defaultValue ?? [min]),
  };
  const parts: SliderControllerParts = {
    root: createUIFnPhase10Part('Slider', 'root', () => ({ id: id('root'), role: 'group', aria: { disabled: store.getState().disabled }, data: { orientation: store.getState().orientation, dir: store.getState().dir, state: store.getState().interaction } }), { id: true, role: true }),
    label: createUIFnPhase10Part('Slider', 'label', () => ({ id: id('label'), attributes: { for: id('control') } }), { id: true }),
    control: createUIFnPhase10Part('Slider', 'control', () => ({ id: id('control'), data: { orientation: store.getState().orientation } }), { id: true }),
    track: createUIFnPhase10Part('Slider', 'track', () => ({ id: id('track'), data: { orientation: store.getState().orientation, state: store.getState().interaction } }), { id: true }),
    range: createUIFnPhase10Part('Slider', 'range', () => {
      const state = store.getState();
      const start = state.value.length === 1
        ? 0
        : rangeValueToPercent(state.value[0] ?? min, { min, max });
      const end = rangeValueToPercent(state.value.at(-1) ?? min, { min, max });
      return {
        id: id('range'),
        data: { orientation: state.orientation },
        style: state.orientation === 'horizontal'
          ? { insetInlineStart: `${start}%`, width: `${end - start}%` }
          : { bottom: `${start}%`, height: `${end - start}%` },
      };
    }, { id: true }),
    thumb: createUIFnPhase10ValuePart('Slider', 'thumb', (index) => { const state = store.getState(); const value = state.value[index] ?? min; const previous = state.value[index - 1] ?? min; const next = state.value[index + 1] ?? max; return { role: 'slider', id: id('thumb', index), tabIndex: state.disabled ? -1 : 0, aria: { valuemin: index ? previous + minSteps * step : min, valuemax: index < state.value.length - 1 ? next - minSteps * step : max, valuenow: value, valuetext: state.valueText[index], orientation: state.orientation, disabled: state.disabled, readonly: state.readOnly, labelledby: id('label') }, data: { index, state: state.activeThumb === index ? 'active' : 'idle', orientation: state.orientation }, style: state.orientation === 'horizontal' ? { insetInlineStart: `${rangeValueToPercent(value, { min, max })}%` } : { bottom: `${rangeValueToPercent(value, { min, max })}%` }, on: { focus: () => actions.setActiveThumb(index), keydown: (event) => actions.keyStep(index, event?.key ?? '') } }; }, { role: true, id: true, tabIndex: true, aria: ['valuemin', 'valuemax', 'valuenow', 'valuetext', 'orientation'] }),
    valueText: createUIFnPhase10ValuePart('Slider', 'valueText', (index) => ({ id: id('value-text', index), data: { value: store.getState().valueText[index] } }), { id: true }),
    hiddenInput: createUIFnPhase10ValuePart('Slider', 'hiddenInput', (index) => ({ id: id('input', index), attributes: { type: 'hidden', name: currentProps.name, value: store.getState().value[index], disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({
    store,
    actions,
    parts,
    env,
    update(inputs) {
      currentProps = { ...currentProps, ...inputs };
      controlled = currentProps.value !== undefined;
      if ('min' in inputs) min = inputs.min ?? 0;
      if ('max' in inputs) max = inputs.max ?? 100;
      if ('step' in inputs) step = inputs.step ?? 1;
      if ('minStepsBetweenThumbs' in inputs) minSteps = Math.max(0, inputs.minStepsBetweenThumbs ?? 0);
      if ('locale' in inputs) {
        locale = inputs.locale ?? resolved.getLocale();
        format = (value: number) => formatUIFnValueText(value, { maximumFractionDigits: 12 }, locale);
      }
      const state = store.getState();
      const value = normalizeSliderValues(inputs.value ?? state.value, min, max, step, minSteps);
      const requestedValue = controlled && !('value' in inputs) && state.requestedValue
        ? normalizeSliderValues(state.requestedValue, min, max, step, minSteps)
        : undefined;
      store.patchState({
        value,
        requestedValue,
        min,
        max,
        step,
        minStepsBetweenThumbs: minSteps,
        orientation: 'orientation' in inputs ? inputs.orientation ?? 'horizontal' : state.orientation,
        dir: 'dir' in inputs ? inputs.dir ?? resolved.getDirection() : state.dir,
        locale,
        disabled: 'disabled' in inputs ? inputs.disabled ?? false : state.disabled,
        readOnly: 'readOnly' in inputs ? inputs.readOnly ?? false : state.readOnly,
        activeThumb: Math.min(state.activeThumb, value.length - 1),
        valueText: Object.freeze(value.map(format)),
      });
    },
  });
}

export interface AngleSliderProps { readonly value?: number; readonly defaultValue?: number; readonly min?: number; readonly max?: number; readonly step?: number; readonly locale?: string; readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly onValueChange?: (value: number) => void }
export interface AngleSliderState { readonly value: number; readonly requestedValue?: number; readonly min: number; readonly max: number; readonly step: number; readonly valueText: string; readonly interaction: 'idle' | 'dragging'; readonly pointers: PointerMap; readonly cancelledPointers: readonly number[]; readonly disabled: boolean; readonly readOnly: boolean; readonly announcement?: string; readonly announcementAt: number; readonly announcementCount: number }
export interface AngleSliderActions { setValue(value: number, modality?: 'keyboard' | 'pointer' | 'touch'): void; syncValue(value: number): void; keyStep(key: string): void; pointerStart(id: number, value: number, kind?: UIFnPointerKind): void; pointerMove(id: number, value: number): void; pointerEnd(id: number): void; pointerCancel(id: number): void; lostPointerCapture(id: number): void; reset(): void }
export interface AngleSliderControllerParts { readonly root: UIFnPhase10Part; readonly track: UIFnPhase10Part; readonly thumb: UIFnPhase10Part; readonly valueText: UIFnPhase10Part; readonly hiddenInput: UIFnPhase10Part }
export type AngleSliderController = UIFnController<AngleSliderState, AngleSliderActions, AngleSliderControllerParts, AngleSliderProps>;
export function createAngleSliderController(props: AngleSliderProps = {}, env: UIFnEnvironment = {}): AngleSliderController {
  const { resolved, id } = createUIFnPhase10Ids('AngleSlider', 'angle-slider', env); const min = props.min ?? 0; const max = props.max ?? 360; const step = props.step ?? 1; const locale = props.locale ?? resolved.getLocale(); const controlled = props.value !== undefined;
  const normalize = (value: number) => alignRangeValue(value, { min, max, step }); const format = (value: number) => formatUIFnLocalizedNumber(value, locale, { maximumFractionDigits: 8, style: 'unit', unit: 'degree' }); const initial = normalize(props.value ?? props.defaultValue ?? min);
  const store = createStateChannel<AngleSliderState>({ value: initial, min, max, step, valueText: format(initial), interaction: 'idle', pointers: Object.freeze({}), cancelledPointers: Object.freeze([]), disabled: props.disabled ?? false, readOnly: props.readOnly ?? false, announcementAt: -1_000_000_000_000, announcementCount: 0 });
  const actions: AngleSliderActions = {
    setValue(value, modality = 'pointer') { const state = store.getState(); if (state.disabled || state.readOnly) return; const next = normalize(value); const result = announce(state.announcementAt, resolved.now(), format(next), modality === 'keyboard'); store.patchState(controlled ? { requestedValue: next, announcement: result.message ?? state.announcement, announcementAt: result.at, announcementCount: state.announcementCount + (result.message ? 1 : 0) } : { value: next, valueText: format(next), announcement: result.message ?? state.announcement, announcementAt: result.at, announcementCount: state.announcementCount + (result.message ? 1 : 0) }); props.onValueChange?.(next); },
    syncValue(value) { const next = normalize(value); store.patchState({ value: next, valueText: format(next), requestedValue: undefined }); },
    keyStep(key) { actions.setValue(stepUIFnRangeValue(store.getState().value, key, { min, max, step }), 'keyboard'); },
    pointerStart(pointerId, value, kind = 'mouse') { const state = store.getState(); const start = point(value); store.patchState({ pointers: setPointer(state.pointers, pointerId, { start, current: start, kind, target: 0 }), interaction: 'dragging' }); actions.setValue(value, kind === 'touch' ? 'touch' : 'pointer'); },
    pointerMove(pointerId, value) { const state = store.getState(); const pointer = state.pointers[pointerId]; if (!pointer) return; store.patchState({ pointers: setPointer(state.pointers, pointerId, { ...pointer, current: point(value) }) }); actions.setValue(value, pointer.kind === 'touch' ? 'touch' : 'pointer'); },
    pointerEnd(pointerId) { const state = store.getState(); const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, interaction: phase(pointers) }); },
    pointerCancel(pointerId) { const state = store.getState(); if (!state.pointers[pointerId]) return; const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, interaction: phase(pointers), cancelledPointers: Object.freeze([...state.cancelledPointers, pointerId]) }); },
    lostPointerCapture: (pointerId) => actions.pointerCancel(pointerId), reset: () => actions.syncValue(props.defaultValue ?? min),
  };
  const parts: AngleSliderControllerParts = {
    root: createUIFnPhase10Part('AngleSlider', 'root', () => ({ id: id('root'), data: { state: store.getState().interaction } }), { id: true }),
    track: createUIFnPhase10Part('AngleSlider', 'track', () => ({ id: id('track'), data: { state: store.getState().interaction } }), { id: true }),
    thumb: createUIFnPhase10Part('AngleSlider', 'thumb', () => { const state = store.getState(); return { role: 'slider', id: id('thumb'), tabIndex: state.disabled ? -1 : 0, aria: { label: 'Angle', valuemin: min, valuemax: max, valuenow: state.value, valuetext: state.valueText, orientation: 'horizontal', disabled: state.disabled, readonly: state.readOnly }, style: { transform: `rotate(${state.value}deg)` }, on: { keydown: (event) => actions.keyStep(event?.key ?? '') } }; }, { role: true, id: true, tabIndex: true, aria: ['label', 'valuemin', 'valuemax', 'valuenow', 'valuetext'] }),
    valueText: createUIFnPhase10Part('AngleSlider', 'valueText', () => ({ id: id('value-text'), data: { value: store.getState().valueText } }), { id: true }),
    hiddenInput: createUIFnPhase10Part('AngleSlider', 'hiddenInput', () => ({ id: id('input'), attributes: { type: 'hidden', name: props.name, value: store.getState().value, disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); } });
}

export interface CarouselProps { readonly index?: number; readonly defaultIndex?: number; readonly itemCount: number; readonly loop?: boolean; readonly orientation?: UIFnAxis; readonly dir?: UIFnGestureDirection; readonly autoplayDelay?: number; readonly reducedMotion?: boolean; readonly locale?: string; readonly messages?: { readonly carousel?: string; readonly slide?: string; readonly item?: (index: number, count: number, locale: string) => string }; readonly onIndexChange?: (index: number) => void }
export interface CarouselState { readonly index: number; readonly requestedIndex?: number; readonly itemCount: number; readonly loop: boolean; readonly orientation: UIFnAxis; readonly dir: UIFnGestureDirection; readonly interaction: 'idle' | 'dragging' | 'autoplaying' | 'paused'; readonly pauseReasons: readonly string[]; readonly pointers: PointerMap; readonly cancelledPointers: readonly number[]; readonly reducedMotion: boolean; readonly announcement?: string }
export interface CarouselActions { previous(): void; next(): void; goTo(index: number, announce?: boolean): void; syncIndex(index: number): void; dragStart(id: number, point: UIFnPoint, kind?: UIFnPointerKind): void; dragMove(id: number, point: UIFnPoint): void; dragEnd(id: number): void; dragCancel(id: number): void; lostPointerCapture(id: number): void; pause(reason?: string): void; resume(reason?: string): void }
export interface CarouselControllerParts { readonly root: UIFnPhase10Part; readonly viewport: UIFnPhase10Part; readonly item: UIFnPhase10ValuePart<number>; readonly previous: UIFnPhase10Part; readonly next: UIFnPhase10Part; readonly indicatorGroup: UIFnPhase10Part; readonly indicator: UIFnPhase10ValuePart<number>; readonly liveRegion: UIFnPhase10Part }
export type CarouselController = UIFnController<CarouselState, CarouselActions, CarouselControllerParts, CarouselProps>;
export function createCarouselController(props: CarouselProps, env: UIFnEnvironment = {}): CarouselController {
  const { resolved, id } = createUIFnPhase10Ids('Carousel', 'carousel', env); let currentProps = props; let controlled = props.index !== undefined; let count = Math.max(0, Math.trunc(props.itemCount)); let loop = props.loop ?? false; let locale = props.locale ?? resolved.getLocale(); let autoplayDelay = Math.max(0, props.autoplayDelay ?? 0); let reducedMotion = props.reducedMotion ?? resolved.prefersReducedMotion(); const initial = resolveUIFnCarouselIndex(props.index ?? props.defaultIndex ?? 0, count, loop);
  const idleInteraction = () => autoplayDelay && !reducedMotion ? 'autoplaying' as const : 'idle' as const;
  const store = createStateChannel<CarouselState>({ index: initial, itemCount: count, loop, orientation: props.orientation ?? 'horizontal', dir: props.dir ?? resolved.getDirection(), interaction: idleInteraction(), pauseReasons: Object.freeze([]), pointers: Object.freeze({}), cancelledPointers: Object.freeze([]), reducedMotion });
  let timer: unknown; const clear = () => { if (timer !== undefined) resolved.scheduler.clearTimeout(timer); timer = undefined; };
  const schedule = () => { clear(); const state = store.getState(); if (!autoplayDelay || state.pauseReasons.length || state.pointers && Object.keys(state.pointers).length || state.reducedMotion) return; timer = resolved.scheduler.setTimeout(() => { timer = undefined; actions.next(); schedule(); }, autoplayDelay); };
  const actions: CarouselActions = {
    previous: () => actions.goTo(store.getState().index - 1), next: () => actions.goTo(store.getState().index + 1),
    goTo(index, shouldAnnounce = true) { const state = store.getState(); const nextIndex = resolveUIFnCarouselIndex(index, count, loop); const message = shouldAnnounce ? new Intl.NumberFormat(locale).format(nextIndex + 1) : state.announcement; if (controlled) store.patchState({ requestedIndex: nextIndex, announcement: message }); else store.patchState({ index: nextIndex, requestedIndex: undefined, announcement: message }); currentProps.onIndexChange?.(nextIndex); },
    syncIndex(index) { store.patchState({ index: resolveUIFnCarouselIndex(index, count, loop), requestedIndex: undefined }); },
    dragStart(pointerId, start, kind = 'mouse') { clear(); const state = store.getState(); store.patchState({ pointers: setPointer(state.pointers, pointerId, { start, current: start, kind, target: state.index }), interaction: 'dragging' }); },
    dragMove(pointerId, current) { const state = store.getState(); const pointer = state.pointers[pointerId]; if (!pointer) return; if (pointer.kind === 'touch') { const arbitration = resolveUIFnTouchArbitration(pointer.start, current, state.orientation); if (arbitration === 'pending') return; if (arbitration === 'scroll') { actions.dragCancel(pointerId); return; } } store.patchState({ pointers: setPointer(state.pointers, pointerId, { ...pointer, current }) }); },
    dragEnd(pointerId) { const state = store.getState(); const pointer = state.pointers[pointerId]; if (!pointer) return; const delta = state.orientation === 'horizontal' ? pointer.current.x - pointer.start.x : pointer.current.y - pointer.start.y; const logical = state.orientation === 'horizontal' && state.dir === 'rtl' ? -delta : delta; if (Math.abs(logical) >= 24) logical < 0 ? actions.next() : actions.previous(); const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, interaction: state.pauseReasons.length ? 'paused' : idleInteraction() }); schedule(); },
    dragCancel(pointerId) { const state = store.getState(); if (!state.pointers[pointerId]) return; const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, cancelledPointers: Object.freeze([...state.cancelledPointers, pointerId]), interaction: state.pauseReasons.length ? 'paused' : idleInteraction() }); schedule(); },
    lostPointerCapture: (pointerId) => actions.dragCancel(pointerId),
    pause(reason = 'manual') { const state = store.getState(); const pauseReasons = Object.freeze([...new Set([...state.pauseReasons, reason])]); clear(); store.patchState({ pauseReasons, interaction: 'paused' }); },
    resume(reason = 'manual') { const state = store.getState(); const pauseReasons = Object.freeze(state.pauseReasons.filter((entry) => entry !== reason)); store.patchState({ pauseReasons, interaction: pauseReasons.length ? 'paused' : idleInteraction() }); schedule(); },
  };
  const parts: CarouselControllerParts = {
    root: createUIFnPhase10Part('Carousel', 'root', () => ({ role: 'region', id: id('root'), aria: { roledescription: currentProps.messages?.carousel }, data: { orientation: store.getState().orientation, state: store.getState().interaction }, on: { pointerenter: () => actions.pause('hover'), pointerleave: () => actions.resume('hover'), focus: () => actions.pause('focus'), blur: () => actions.resume('focus') } }), { role: true, id: true }),
    viewport: createUIFnPhase10Part('Carousel', 'viewport', () => ({ id: id('viewport'), data: { orientation: store.getState().orientation } }), { id: true }),
    item: createUIFnPhase10ValuePart('Carousel', 'item', (index) => ({ role: 'group', id: id('item', index), aria: { roledescription: currentProps.messages?.slide, label: currentProps.messages?.item?.(index, count, locale) ?? `${new Intl.NumberFormat(locale).format(index + 1)} / ${new Intl.NumberFormat(locale).format(count)}` }, data: { state: store.getState().index === index ? 'active' : 'inactive' }, hidden: store.getState().index !== index }), { role: true, id: true }),
    previous: createUIFnPhase10Part('Carousel', 'previous', () => ({ role: 'button', id: id('previous'), disabled: !count || !loop && store.getState().index === 0, on: { click: actions.previous } }), { role: true, id: true }),
    next: createUIFnPhase10Part('Carousel', 'next', () => ({ role: 'button', id: id('next'), disabled: !count || !loop && store.getState().index === count - 1, on: { click: actions.next } }), { role: true, id: true }),
    indicatorGroup: createUIFnPhase10Part('Carousel', 'indicatorGroup', () => ({ role: 'group', id: id('indicators') }), { role: true, id: true }),
    indicator: createUIFnPhase10ValuePart('Carousel', 'indicator', (index) => ({ role: 'button', id: id('indicator', index), aria: { current: store.getState().index === index ? 'true' : undefined, label: new Intl.NumberFormat(locale).format(index + 1) }, data: { state: store.getState().index === index ? 'active' : 'inactive' }, on: { click: () => actions.goTo(index) } }), { role: true, id: true }),
    liveRegion: createUIFnPhase10Part('Carousel', 'liveRegion', () => ({ role: 'status', id: id('live'), aria: { live: 'polite', atomic: true }, data: { message: store.getState().announcement } }), { role: true, id: true, aria: ['live'] }),
  };
  schedule(); return createUIFnPhase10Controller({
    store,
    actions,
    parts,
    env,
    update(inputs) {
      currentProps = { ...currentProps, ...inputs };
      controlled = currentProps.index !== undefined;
      count = Math.max(0, Math.trunc(currentProps.itemCount));
      loop = currentProps.loop ?? false;
      locale = currentProps.locale ?? resolved.getLocale();
      autoplayDelay = Math.max(0, currentProps.autoplayDelay ?? 0);
      reducedMotion = currentProps.reducedMotion ?? resolved.prefersReducedMotion();
      const state = store.getState();
      const index = resolveUIFnCarouselIndex(
        'index' in inputs && inputs.index !== undefined ? inputs.index : state.index,
        count,
        loop,
      );
      const requestedIndex = controlled && !('index' in inputs) && state.requestedIndex !== undefined
        ? resolveUIFnCarouselIndex(state.requestedIndex, count, loop)
        : undefined;
      const pointers = count ? state.pointers : Object.freeze({});
      store.patchState({
        index,
        requestedIndex,
        itemCount: count,
        loop,
        orientation: currentProps.orientation ?? 'horizontal',
        dir: currentProps.dir ?? resolved.getDirection(),
        interaction: Object.keys(pointers).length
          ? 'dragging'
          : state.pauseReasons.length
            ? 'paused'
            : idleInteraction(),
        pointers,
        reducedMotion,
      });
      schedule();
    },
    destroy: clear,
  });
}

export interface RatingGroupProps { readonly value?: number; readonly defaultValue?: number; readonly count?: number; readonly allowHalf?: boolean; readonly locale?: string; readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly onValueChange?: (value: number) => void }
export interface RatingGroupState { readonly value: number; readonly requestedValue?: number; readonly preview: number | null; readonly count: number; readonly allowHalf: boolean; readonly valueText: string; readonly disabled: boolean; readonly readOnly: boolean; readonly required: boolean }
export interface RatingGroupActions { select(value: number): void; hover(value: number | null): void; clear(): void; keyStep(key: string): void; syncValue(value: number): void; reset(): void }
export interface RatingGroupControllerParts { readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly control: UIFnPhase10Part; readonly item: UIFnPhase10ValuePart<number>; readonly itemIndicator: UIFnPhase10ValuePart<number>; readonly hiddenInput: UIFnPhase10Part; readonly valueText: UIFnPhase10Part }
export type RatingGroupController = UIFnController<RatingGroupState, RatingGroupActions, RatingGroupControllerParts, RatingGroupProps>;
export function createRatingGroupController(props: RatingGroupProps = {}, env: UIFnEnvironment = {}): RatingGroupController {
  const { resolved, id } = createUIFnPhase10Ids('RatingGroup', 'rating-group', env); const count = Math.max(1, Math.trunc(props.count ?? 5)); const step = props.allowHalf ? 0.5 : 1; const controlled = props.value !== undefined; const locale = props.locale ?? resolved.getLocale(); const normalize = (value: number) => alignRangeValue(value, { min: 0, max: count, step }); const text = (value: number) => `${formatUIFnLocalizedNumber(value, locale)} / ${formatUIFnLocalizedNumber(count, locale)}`; const initial = normalize(props.value ?? props.defaultValue ?? 0);
  const store = createStateChannel<RatingGroupState>({ value: initial, preview: null, count, allowHalf: props.allowHalf ?? false, valueText: text(initial), disabled: props.disabled ?? false, readOnly: props.readOnly ?? false, required: props.required ?? false });
  const actions: RatingGroupActions = { select(value) { const state = store.getState(); if (state.disabled || state.readOnly) return; const next = normalize(value); if (controlled) store.patchState({ requestedValue: next, preview: null }); else store.patchState({ value: next, valueText: text(next), preview: null, requestedValue: undefined }); props.onValueChange?.(next); }, hover(value) { if (!store.getState().disabled) store.patchState({ preview: value === null ? null : normalize(value) }); }, clear() { if (!store.getState().required) actions.select(0); }, keyStep(key) { actions.select(stepUIFnRangeValue(store.getState().value, key, { min: 0, max: count, step })); }, syncValue(value) { const next = normalize(value); store.patchState({ value: next, valueText: text(next), requestedValue: undefined }); }, reset: () => actions.syncValue(props.defaultValue ?? 0) };
  const parts: RatingGroupControllerParts = {
    root: createUIFnPhase10Part('RatingGroup', 'root', () => ({ role: 'radiogroup', id: id('root'), aria: { required: store.getState().required, disabled: store.getState().disabled, labelledby: id('label') } }), { role: true, id: true }),
    label: createUIFnPhase10Part('RatingGroup', 'label', () => ({ id: id('label') }), { id: true }), control: createUIFnPhase10Part('RatingGroup', 'control', () => ({ id: id('control') }), { id: true }),
    item: createUIFnPhase10ValuePart('RatingGroup', 'item', (value) => { const state = store.getState(); const selected = state.value === value; return { role: 'radio', id: id('item', value), attributes: { type: 'button' }, tabIndex: selected || (!state.value && value === step) ? 0 : -1, aria: { checked: selected, label: text(value), disabled: state.disabled }, data: { state: (state.preview ?? state.value) >= value ? 'highlighted' : 'empty' }, on: { click: () => actions.select(value), pointerenter: () => actions.hover(value), pointerleave: () => actions.hover(null), keydown: (event) => actions.keyStep(event?.key ?? '') } }; }, { role: true, id: true, tabIndex: true, aria: ['checked', 'label'] }),
    itemIndicator: createUIFnPhase10ValuePart('RatingGroup', 'itemIndicator', (value) => ({ id: id('indicator', value), data: { state: (store.getState().preview ?? store.getState().value) >= value ? 'filled' : 'empty' } }), { id: true }),
    hiddenInput: createUIFnPhase10Part('RatingGroup', 'hiddenInput', () => ({ id: id('input'), attributes: { type: 'hidden', name: props.name, value: store.getState().value, required: store.getState().required, disabled: store.getState().disabled } }), { id: true }),
    valueText: createUIFnPhase10Part('RatingGroup', 'valueText', () => ({ id: id('value-text'), aria: { live: 'polite' }, data: { value: store.getState().valueText } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); } });
}

export interface UIFnSignaturePoint extends UIFnPoint { readonly pressure: number; readonly time: number }
export type UIFnSignatureStroke = readonly UIFnSignaturePoint[];
export interface SignaturePadProps { readonly value?: readonly UIFnSignatureStroke[]; readonly defaultValue?: readonly UIFnSignatureStroke[]; readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly required?: boolean; readonly messages?: { readonly empty?: string; readonly complete?: string }; readonly onValueChange?: (value: readonly UIFnSignatureStroke[]) => void }
export interface SignaturePadState { readonly strokes: readonly UIFnSignatureStroke[]; readonly requestedValue?: readonly UIFnSignatureStroke[]; readonly active: Readonly<Record<string, UIFnSignatureStroke>>; readonly status: 'empty' | 'drawing' | 'complete'; readonly cancelledPointers: readonly number[]; readonly disabled: boolean; readonly readOnly: boolean; readonly required: boolean; readonly statusMessage: string }
export interface SignaturePadActions { pointerStart(id: number, point: UIFnSignaturePoint): void; pointerMove(id: number, point: UIFnSignaturePoint): void; pointerEnd(id: number): void; pointerCancel(id: number): void; lostPointerCapture(id: number): void; undo(): void; clear(): void; syncValue(value: readonly UIFnSignatureStroke[]): void; reset(): void }
export interface SignaturePadControllerParts { readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly canvas: UIFnPhase10Part; readonly clear: UIFnPhase10Part; readonly undo: UIFnPhase10Part; readonly status: UIFnPhase10Part; readonly hiddenInput: UIFnPhase10Part }
export type SignaturePadController = UIFnController<SignaturePadState, SignaturePadActions, SignaturePadControllerParts, SignaturePadProps>;
export function createSignaturePadController(props: SignaturePadProps = {}, env: UIFnEnvironment = {}): SignaturePadController {
  const { id } = createUIFnPhase10Ids('SignaturePad', 'signature-pad', env); const controlled = props.value !== undefined; const emptyMessage = props.messages?.empty ?? ''; const completeMessage = props.messages?.complete ?? ''; const initial = Object.freeze([...(props.value ?? props.defaultValue ?? [])]);
  const store = createStateChannel<SignaturePadState>({ strokes: initial, active: Object.freeze({}), status: initial.length ? 'complete' : 'empty', cancelledPointers: Object.freeze([]), disabled: props.disabled ?? false, readOnly: props.readOnly ?? false, required: props.required ?? false, statusMessage: initial.length ? completeMessage : emptyMessage });
  const commit = (value: readonly UIFnSignatureStroke[]) => { const frozen = Object.freeze([...value]); if (controlled) store.patchState({ requestedValue: frozen }); else store.patchState({ strokes: frozen, requestedValue: undefined, status: frozen.length ? 'complete' : 'empty', statusMessage: frozen.length ? completeMessage : emptyMessage }); props.onValueChange?.(frozen); };
  const actions: SignaturePadActions = {
    pointerStart(pointerId, signaturePoint) { const state = store.getState(); if (state.disabled || state.readOnly) return; store.patchState({ active: Object.freeze({ ...state.active, [pointerId]: Object.freeze([signaturePoint]) }), status: 'drawing' }); },
    pointerMove(pointerId, signaturePoint) { const state = store.getState(); const stroke = state.active[pointerId]; if (!stroke) return; store.patchState({ active: Object.freeze({ ...state.active, [pointerId]: Object.freeze([...stroke, signaturePoint]) }) }); },
    pointerEnd(pointerId) { const state = store.getState(); const stroke = state.active[pointerId]; if (!stroke) return; const active = { ...state.active }; delete active[pointerId]; store.patchState({ active: Object.freeze(active) }); commit([...state.strokes, stroke]); },
    pointerCancel(pointerId) { const state = store.getState(); if (!state.active[pointerId]) return; const active = { ...state.active }; delete active[pointerId]; store.patchState({ active: Object.freeze(active), cancelledPointers: Object.freeze([...state.cancelledPointers, pointerId]), status: state.strokes.length ? 'complete' : 'empty' }); },
    lostPointerCapture: (pointerId) => actions.pointerCancel(pointerId), undo() { commit(store.getState().strokes.slice(0, -1)); }, clear() { commit([]); }, syncValue(value) { const strokes = Object.freeze([...value]); store.patchState({ strokes, requestedValue: undefined, active: Object.freeze({}), status: strokes.length ? 'complete' : 'empty', statusMessage: strokes.length ? completeMessage : emptyMessage }); }, reset: () => actions.syncValue(props.defaultValue ?? []),
  };
  const parts: SignaturePadControllerParts = {
    root: createUIFnPhase10Part('SignaturePad', 'root', () => ({ id: id('root'), data: { state: store.getState().status } }), { id: true }), label: createUIFnPhase10Part('SignaturePad', 'label', () => ({ id: id('label') }), { id: true }),
    canvas: createUIFnPhase10Part('SignaturePad', 'canvas', () => ({ role: 'img', id: id('canvas'), tabIndex: store.getState().disabled ? -1 : 0, aria: { labelledby: id('label'), describedby: id('status'), disabled: store.getState().disabled }, data: { state: store.getState().status, readonly: store.getState().readOnly } }), { role: true, id: true, tabIndex: true }),
    clear: createUIFnPhase10Part('SignaturePad', 'clear', () => ({ role: 'button', id: id('clear'), disabled: store.getState().disabled || store.getState().readOnly, on: { click: actions.clear } }), { role: true, id: true }), undo: createUIFnPhase10Part('SignaturePad', 'undo', () => ({ role: 'button', id: id('undo'), disabled: !store.getState().strokes.length || store.getState().disabled || store.getState().readOnly, on: { click: actions.undo } }), { role: true, id: true }),
    status: createUIFnPhase10Part('SignaturePad', 'status', () => ({ role: 'status', id: id('status'), aria: { live: 'polite' }, data: { message: store.getState().statusMessage } }), { role: true, id: true, aria: ['live'] }), hiddenInput: createUIFnPhase10Part('SignaturePad', 'hiddenInput', () => ({ id: id('input'), attributes: { type: 'hidden', name: props.name, value: JSON.stringify(store.getState().strokes), required: store.getState().required, disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); } });
}

export interface SplitterProps { readonly sizes?: readonly number[]; readonly defaultSizes?: readonly number[]; readonly minSizes?: readonly number[]; readonly maxSizes?: readonly number[]; readonly orientation?: UIFnAxis; readonly dir?: UIFnGestureDirection; readonly disabled?: boolean; readonly locale?: string; readonly onSizesChange?: (sizes: readonly number[]) => void }
export interface SplitterState { readonly sizes: readonly number[]; readonly requestedSizes?: readonly number[]; readonly minSizes: readonly number[]; readonly maxSizes: readonly number[]; readonly orientation: UIFnAxis; readonly dir: UIFnGestureDirection; readonly resizing: number | null; readonly pointers: PointerMap; readonly cancelledPointers: readonly number[]; readonly disabled: boolean; readonly valueText: readonly string[] }
export interface SplitterActions { resize(index: number, delta: number, modality?: 'keyboard' | 'pointer' | 'touch'): void; keyResize(index: number, key: string): void; resizeStart(id: number, index: number, coordinate: number, kind?: UIFnPointerKind): void; resizeMove(id: number, coordinate: number): void; resizeEnd(id: number): void; resizeCancel(id: number): void; lostPointerCapture(id: number): void; collapse(index: number): void; expand(index: number): void; syncSizes(sizes: readonly number[]): void }
export interface SplitterControllerParts { readonly root: UIFnPhase10Part; readonly panel: UIFnPhase10ValuePart<number>; readonly resizeTrigger: UIFnPhase10ValuePart<number>; readonly resizeHandle: UIFnPhase10ValuePart<number> }
export type SplitterController = UIFnController<SplitterState, SplitterActions, SplitterControllerParts, SplitterProps>;
export function createSplitterController(props: SplitterProps = {}, env: UIFnEnvironment = {}): SplitterController {
  const { resolved, id } = createUIFnPhase10Ids('Splitter', 'splitter', env); const initial = Object.freeze([...(props.sizes ?? props.defaultSizes ?? [50, 50])]); const minSizes = Object.freeze([...(props.minSizes ?? initial.map(() => 0))]); const maxSizes = Object.freeze([...(props.maxSizes ?? initial.map(() => 100))]); const controlled = props.sizes !== undefined; const locale = props.locale ?? resolved.getLocale(); const texts = (sizes: readonly number[]) => Object.freeze(sizes.map((size) => formatUIFnLocalizedNumber(size / 100, locale, { style: 'percent', maximumFractionDigits: 2 })));
  const store = createStateChannel<SplitterState>({ sizes: initial, minSizes, maxSizes, orientation: props.orientation ?? 'horizontal', dir: props.dir ?? resolved.getDirection(), resizing: null, pointers: Object.freeze({}), cancelledPointers: Object.freeze([]), disabled: props.disabled ?? false, valueText: texts(initial) });
  const commit = (sizes: readonly number[]) => { if (controlled) store.patchState({ requestedSizes: sizes }); else store.patchState({ sizes, valueText: texts(sizes), requestedSizes: undefined }); props.onSizesChange?.(sizes); };
  const actions: SplitterActions = {
    resize(index, delta) { if (store.getState().disabled) return; const state = store.getState(); const logical = state.orientation === 'horizontal' && state.dir === 'rtl' ? -delta : delta; commit(resizeUIFnSplitterPair(state.sizes, index, logical, minSizes, maxSizes)); },
    keyResize(index, key) { if (key === 'Home') return actions.collapse(index); if (key === 'End') return actions.expand(index); const amount = key === 'PageUp' ? 10 : key === 'PageDown' ? -10 : key === 'ArrowUp' || key === 'ArrowRight' ? 1 : key === 'ArrowDown' || key === 'ArrowLeft' ? -1 : 0; actions.resize(index, amount); },
    resizeStart(pointerId, index, coordinate, kind = 'mouse') { const state = store.getState(); if (state.disabled || index >= state.sizes.length - 1) return; const start = point(coordinate); store.patchState({ resizing: index, pointers: setPointer(state.pointers, pointerId, { start, current: start, kind, target: index }) }); },
    resizeMove(pointerId, coordinate) { const state = store.getState(); const pointer = state.pointers[pointerId]; if (!pointer) return; const current = point(coordinate); const delta = coordinate - pointer.current.x; store.patchState({ pointers: setPointer(state.pointers, pointerId, { ...pointer, current }) }); actions.resize(pointer.target, delta, pointer.kind === 'touch' ? 'touch' : 'pointer'); },
    resizeEnd(pointerId) { const state = store.getState(); const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, resizing: Object.keys(pointers).length ? state.resizing : null }); },
    resizeCancel(pointerId) { const state = store.getState(); if (!state.pointers[pointerId]) return; const pointers = removePointer(state.pointers, pointerId); store.patchState({ pointers, resizing: Object.keys(pointers).length ? state.resizing : null, cancelledPointers: Object.freeze([...state.cancelledPointers, pointerId]) }); },
    lostPointerCapture: (pointerId) => actions.resizeCancel(pointerId), collapse(index) { const state = store.getState(); actions.resize(index, (minSizes[index] ?? 0) - state.sizes[index]); }, expand(index) { const state = store.getState(); actions.resize(index, (maxSizes[index] ?? 100) - state.sizes[index]); }, syncSizes(sizes) { const next = Object.freeze([...sizes]); store.patchState({ sizes: next, valueText: texts(next), requestedSizes: undefined }); },
  };
  const parts: SplitterControllerParts = {
    root: createUIFnPhase10Part('Splitter', 'root', () => ({ role: 'group', id: id('root'), data: { orientation: store.getState().orientation, dir: store.getState().dir } }), { role: true, id: true }),
    panel: createUIFnPhase10ValuePart('Splitter', 'panel', (index) => ({ id: id('panel', index), data: { index, state: store.getState().sizes[index] === (minSizes[index] ?? 0) ? 'collapsed' : 'expanded' }, style: { flexBasis: `${store.getState().sizes[index] ?? 0}%` } }), { id: true }),
    resizeTrigger: createUIFnPhase10ValuePart('Splitter', 'resizeTrigger', (index) => ({ role: 'separator', id: id('trigger', index), tabIndex: store.getState().disabled ? -1 : 0, aria: { orientation: store.getState().orientation === 'horizontal' ? 'vertical' : 'horizontal', valuemin: minSizes[index], valuemax: maxSizes[index], valuenow: store.getState().sizes[index], valuetext: store.getState().valueText[index], controls: `${id('panel', index)} ${id('panel', index + 1)}`, disabled: store.getState().disabled }, data: { state: store.getState().resizing === index ? 'resizing' : 'idle' }, on: { keydown: (event) => actions.keyResize(index, event?.key ?? '') } }), { role: true, id: true, tabIndex: true, aria: ['orientation', 'valuemin', 'valuemax', 'valuenow', 'valuetext', 'controls'] }),
    resizeHandle: createUIFnPhase10ValuePart('Splitter', 'resizeHandle', (index) => ({ id: id('handle', index), data: { state: store.getState().resizing === index ? 'resizing' : 'idle' } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.sizes !== undefined) actions.syncSizes(inputs.sizes); } });
}

export function assertUIFnCancelledGesture(controller: { readonly state: { readonly pointers: PointerMap } }, pointerId: number): void {
  assertUIFnGestureInactive(Boolean(controller.state.pointers[pointerId]), { pointerId });
}
