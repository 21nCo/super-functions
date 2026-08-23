import type { UIFnController } from '../controller';
import { createUIFnEnvironment, type UIFnEnvironment } from '../environment';
import { createUIFnError } from '../errors';
import { createStateChannel } from '../internal/runtime/state-channel';
import {
  addUIFnDateDays,
  addUIFnDateMonths,
  colorUIFnDistance,
  compareUIFnDates,
  createUIFnCalendarDate,
  createUIFnMonthGrid,
  formatUIFnDate,
  hslaToUIFnRgba,
  isUIFnDateAvailable,
  parseUIFnColor,
  rgbaToUIFnHsla,
  serializeUIFnColor,
  serializeUIFnDate,
  setUIFnDateSegment,
  type UIFnCalendarDate,
  type UIFnColor,
  type UIFnDateSegment,
  type UIFnHslaColor,
  type UIFnRgbaColor,
} from '../algorithms';
import {
  createUIFnPhase10Controller,
  createUIFnPhase10Ids,
  createUIFnPhase10Part,
  createUIFnPhase10ValuePart,
  type UIFnPhase10Part,
  type UIFnPhase10ValuePart,
} from './phase10-shared';

export interface ColorPickerProps {
  readonly value?: string | UIFnColor; readonly defaultValue?: string | UIFnColor; readonly open?: boolean; readonly defaultOpen?: boolean;
  readonly colorSpace?: 'srgb' | 'hsl'; readonly alpha?: boolean; readonly locale?: string; readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean;
  readonly messages?: { readonly channels?: Readonly<Record<string, string>> }; readonly onValueChange?: (value: UIFnRgbaColor) => void; readonly onOpenChange?: (open: boolean) => void;
}
export interface ColorPickerState { readonly value: UIFnRgbaColor; readonly serialized: string; readonly open: boolean; readonly requestedValue?: UIFnRgbaColor; readonly requestedOpen?: boolean; readonly colorSpace: 'srgb' | 'hsl'; readonly alpha: boolean; readonly channels: Readonly<Record<string, number>>; readonly disabled: boolean; readonly readOnly: boolean; readonly roundTripError: number }
export interface ColorPickerActions { setOpen(open: boolean): void; syncOpen(open: boolean): void; setValue(value: string | UIFnColor): void; syncValue(value: string | UIFnColor): void; setChannel(channel: string, value: number): void; setArea(x: number, y: number): void; reset(): void }
export interface ColorPickerControllerParts { readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly control: UIFnPhase10Part; readonly trigger: UIFnPhase10Part; readonly positioner: UIFnPhase10Part; readonly content: UIFnPhase10Part; readonly area: UIFnPhase10Part; readonly areaThumb: UIFnPhase10Part; readonly channelSlider: UIFnPhase10ValuePart<string>; readonly channelInput: UIFnPhase10ValuePart<string>; readonly swatch: UIFnPhase10Part; readonly hiddenInput: UIFnPhase10Part }
export type ColorPickerController = UIFnController<ColorPickerState, ColorPickerActions, ColorPickerControllerParts, ColorPickerProps>;

function rgba(value: string | UIFnColor): UIFnRgbaColor { return typeof value === 'string' ? parseUIFnColor(value) : value.space === 'srgb' ? value : hslaToUIFnRgba(value); }
function colorChannels(value: UIFnRgbaColor, space: 'srgb' | 'hsl'): Readonly<Record<string, number>> { if (space === 'srgb') return Object.freeze({ r: value.r, g: value.g, b: value.b, alpha: value.alpha }); const { h, s, l, alpha } = rgbaToUIFnHsla(value); return Object.freeze({ h, s, l, alpha }); }
function colorChannelMaximum(channel: string): number { return channel === 'alpha' ? 1 : channel === 'h' ? 360 : channel === 'r' || channel === 'g' || channel === 'b' ? 255 : 100; }
function normalizeColorChannel(channel: string, value: number): number {
  const maximum = colorChannelMaximum(channel);
  const clamped = Math.max(0, Math.min(maximum, Number.isFinite(value) ? value : 0));
  return channel === 'alpha' ? Math.round(clamped * 100) / 100 : Math.round(clamped);
}

export function createColorPickerController(props: ColorPickerProps = {}, env: UIFnEnvironment = {}): ColorPickerController {
  const { id } = createUIFnPhase10Ids('ColorPicker', 'color-picker', env); const valueControlled = props.value !== undefined; const openControlled = props.open !== undefined; const space = props.colorSpace ?? 'srgb'; const initial = rgba(props.value ?? props.defaultValue ?? '#000000');
  const snapshot = (value: UIFnRgbaColor) => ({ value, serialized: serializeUIFnColor(value, props.alpha ?? true), channels: colorChannels(value, space), roundTripError: colorUIFnDistance(value, parseUIFnColor(serializeUIFnColor(value, true))) });
  const store = createStateChannel<ColorPickerState>({ ...snapshot(initial), open: props.open ?? props.defaultOpen ?? false, colorSpace: space, alpha: props.alpha ?? true, disabled: props.disabled ?? false, readOnly: props.readOnly ?? false });
  const actions: ColorPickerActions = {
    setOpen(open) { if (store.getState().disabled) return; if (openControlled) store.patchState({ requestedOpen: open }); else store.patchState({ open, requestedOpen: undefined }); props.onOpenChange?.(open); },
    syncOpen(open) { store.patchState({ open, requestedOpen: undefined }); },
    setValue(value) { const state = store.getState(); if (state.disabled || state.readOnly) return; const next = rgba(value); if (valueControlled) store.patchState({ requestedValue: next }); else store.patchState({ ...snapshot(next), requestedValue: undefined }); props.onValueChange?.(next); },
    syncValue(value) { const next = rgba(value); store.patchState({ ...snapshot(next), requestedValue: undefined }); },
    setChannel(channel, channelValue) { const state = store.getState(); const nextValue = normalizeColorChannel(channel, channelValue); if (state.colorSpace === 'srgb') { const current = state.value; actions.setValue({ space: 'srgb', r: channel === 'r' ? nextValue : current.r, g: channel === 'g' ? nextValue : current.g, b: channel === 'b' ? nextValue : current.b, alpha: channel === 'alpha' ? nextValue : current.alpha }); } else { const current = rgbaToUIFnHsla(state.value); actions.setValue({ space: 'hsl', h: channel === 'h' ? nextValue : current.h, s: channel === 's' ? nextValue : current.s, l: channel === 'l' ? nextValue : current.l, alpha: channel === 'alpha' ? nextValue : current.alpha }); } },
    setArea(x, y) { const current = rgbaToUIFnHsla(store.getState().value); actions.setValue({ ...current, s: Math.max(0, Math.min(100, x)), l: Math.max(0, Math.min(100, 100 - y)) }); },
    reset() { actions.syncValue(props.defaultValue ?? '#000000'); actions.syncOpen(props.defaultOpen ?? false); },
  };
  const parts: ColorPickerControllerParts = {
    root: createUIFnPhase10Part('ColorPicker', 'root', () => ({ id: id('root'), data: { state: store.getState().open ? 'open' : 'closed', colorSpace: space } }), { id: true }), label: createUIFnPhase10Part('ColorPicker', 'label', () => ({ id: id('label') }), { id: true }), control: createUIFnPhase10Part('ColorPicker', 'control', () => ({ id: id('control') }), { id: true }),
    trigger: createUIFnPhase10Part('ColorPicker', 'trigger', () => ({ role: 'button', id: id('trigger'), aria: { expanded: store.getState().open, controls: id('content'), labelledby: id('label') }, disabled: store.getState().disabled, on: { click: () => actions.setOpen(!store.getState().open) } }), { role: true, id: true, aria: ['expanded', 'controls'] }), positioner: createUIFnPhase10Part('ColorPicker', 'positioner', () => ({ id: id('positioner'), hidden: !store.getState().open }), { id: true }),
    content: createUIFnPhase10Part('ColorPicker', 'content', () => ({
      role: 'dialog',
      id: id('content'),
      aria: { labelledby: id('label') },
      data: { state: store.getState().open ? 'open' : 'closed' },
      hidden: !store.getState().open,
      on: {
        keydown: (event) => {
          if (event?.key !== 'Escape') return;
          event.preventDefault?.();
          event.stopPropagation?.();
          actions.setOpen(false);
        },
      },
    }), { role: true, id: true }),
    area: createUIFnPhase10Part('ColorPicker', 'area', () => ({ role: 'application', id: id('area'), aria: { labelledby: id('label') }, data: { colorSpace: 'hsl' } }), { role: true, id: true }),
    areaThumb: createUIFnPhase10Part('ColorPicker', 'areaThumb', () => {
      const hsl = rgbaToUIFnHsla(store.getState().value);
      return {
        role: 'slider',
        id: id('area-thumb'),
        tabIndex: 0,
        aria: {
          labelledby: id('label'),
          valuemin: 0,
          valuemax: 100,
          valuenow: hsl.s,
          valuetext: `${Math.round(hsl.s)}% saturation, ${Math.round(hsl.l)}% lightness`,
        },
        style: { left: `${hsl.s}%`, bottom: `${hsl.l}%` },
        on: {
          keydown: (event) => {
            const key = event?.key;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key ?? '')) return;
            event?.preventDefault?.();
            if (key === 'Home') actions.setArea(0, 100 - hsl.l);
            else if (key === 'End') actions.setArea(100, 100 - hsl.l);
            else if (key === 'ArrowLeft') actions.setArea(hsl.s - 1, 100 - hsl.l);
            else if (key === 'ArrowRight') actions.setArea(hsl.s + 1, 100 - hsl.l);
            else if (key === 'ArrowUp') actions.setArea(hsl.s, 100 - (hsl.l + 1));
            else if (key === 'ArrowDown') actions.setArea(hsl.s, 100 - (hsl.l - 1));
          },
        },
      };
    }, { role: true, id: true, tabIndex: true, aria: ['valuemin', 'valuemax', 'valuenow', 'valuetext'] }),
    channelSlider: createUIFnPhase10ValuePart('ColorPicker', 'channelSlider', (channel) => {
      const value = store.getState().channels[channel] ?? 0;
      const maximum = channel === 'alpha'
        ? 1
        : channel === 'h'
          ? 360
          : channel === 'r' || channel === 'g' || channel === 'b'
            ? 255
            : 100;
      return {
        role: 'slider',
        id: id('slider', channel),
        tabIndex: 0,
        aria: {
          valuemin: 0,
          valuemax: maximum,
          valuenow: value,
          label: props.messages?.channels?.[channel] ?? ({ r: 'R', g: 'G', b: 'B', h: 'H', s: 'S', l: 'L', alpha: 'α' } as Record<string, string>)[channel],
        },
        data: { channel },
        // State projection only: styled adapters use this value to position
        // their visual thumb without duplicating channel-range math.
        style: { '--uifn-channel-position': `${Math.max(0, Math.min(100, (value / maximum) * 100))}%` },
        on: {
          keydown: (event) => {
            const key = event?.key;
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(key ?? '')) return;
            event?.preventDefault?.();
            const step = channel === 'alpha' ? 0.01 : 1;
            if (key === 'Home') actions.setChannel(channel, 0);
            else if (key === 'End') actions.setChannel(channel, maximum);
            else if (key === 'PageUp') actions.setChannel(channel, value + step * 10);
            else if (key === 'PageDown') actions.setChannel(channel, value - step * 10);
            else if (key === 'ArrowRight' || key === 'ArrowUp') actions.setChannel(channel, value + step);
            else actions.setChannel(channel, value - step);
          },
        },
      };
    }, { role: true, id: true, tabIndex: true, aria: ['valuemin', 'valuemax', 'valuenow', 'label'] }),
    channelInput: createUIFnPhase10ValuePart('ColorPicker', 'channelInput', (channel) => ({ role: 'spinbutton', id: id('input', channel), aria: { valuenow: store.getState().channels[channel] ?? 0, label: props.messages?.channels?.[channel] ?? ({ r: 'R', g: 'G', b: 'B', h: 'H', s: 'S', l: 'L', alpha: 'α' } as Record<string, string>)[channel] }, attributes: { value: store.getState().channels[channel] ?? 0 }, data: { channel }, on: { input: (event) => actions.setChannel(channel, Number(event?.value ?? 0)) } }), { role: true, id: true, aria: ['valuenow', 'label'] }), swatch: createUIFnPhase10Part('ColorPicker', 'swatch', () => ({ id: id('swatch'), style: { backgroundColor: store.getState().serialized }, data: { value: store.getState().serialized } }), { id: true }), hiddenInput: createUIFnPhase10Part('ColorPicker', 'hiddenInput', () => ({ id: id('hidden-input'), attributes: { type: 'hidden', name: props.name, value: store.getState().serialized, disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); if (inputs.open !== undefined) actions.syncOpen(inputs.open); } });
}

type DisplayCalendar = 'gregory' | 'japanese' | 'buddhist';
export interface DateInputProps { readonly value?: UIFnCalendarDate; readonly defaultValue?: UIFnCalendarDate; readonly locale?: string; readonly timeZone?: string; readonly calendar?: DisplayCalendar; readonly min?: UIFnCalendarDate; readonly max?: UIFnCalendarDate; readonly name?: string; readonly disabled?: boolean; readonly readOnly?: boolean; readonly messages?: { readonly invalid?: string; readonly segments?: Partial<Record<UIFnDateSegment, string>> }; readonly onValueChange?: (value: UIFnCalendarDate) => void }
export interface DateInputState { readonly value: UIFnCalendarDate; readonly requestedValue?: UIFnCalendarDate; readonly locale: string; readonly timeZone: string; readonly calendar: DisplayCalendar; readonly displayValue: string; readonly focusedSegment: UIFnDateSegment; readonly editing: boolean; readonly valid: boolean; readonly message: string; readonly disabled: boolean; readonly readOnly: boolean }
export interface DateInputActions { focusSegment(segment: UIFnDateSegment): void; editSegment(segment: UIFnDateSegment, value: number): void; increment(segment?: UIFnDateSegment): void; decrement(segment?: UIFnDateSegment): void; commit(): void; syncValue(value: UIFnCalendarDate): void; reset(): void }
export interface DateInputControllerParts { readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly segment: UIFnPhase10ValuePart<UIFnDateSegment>; readonly hiddenInput: UIFnPhase10Part; readonly error: UIFnPhase10Part }
export type DateInputController = UIFnController<DateInputState, DateInputActions, DateInputControllerParts, DateInputProps>;

function displayDate(value: UIFnCalendarDate, locale: string, calendar: DisplayCalendar): string { return formatUIFnDate(value, `${locale}-u-ca-${calendar}`); }
function segmentValue(value: UIFnCalendarDate, segment: UIFnDateSegment): number { return value[segment]; }

export function createDateInputController(props: DateInputProps = {}, env: UIFnEnvironment = {}): DateInputController {
  const { resolved, id } = createUIFnPhase10Ids('DateInput', 'date-input', env); const controlled = props.value !== undefined; const locale = props.locale ?? resolved.getLocale(); const timeZone = props.timeZone ?? resolved.getTimeZone(); const calendar = props.calendar ?? 'gregory'; const initial = props.value ?? props.defaultValue ?? createUIFnCalendarDate(1970, 1, 1); const valid = (value: UIFnCalendarDate) => isUIFnDateAvailable(value, { min: props.min, max: props.max }); const invalidMessage = props.messages?.invalid ?? '';
  const store = createStateChannel<DateInputState>({ value: initial, locale, timeZone, calendar, displayValue: displayDate(initial, locale, calendar), focusedSegment: 'day', editing: false, valid: valid(initial), message: valid(initial) ? '' : invalidMessage, disabled: props.disabled ?? false, readOnly: props.readOnly ?? false });
  const commit = (value: UIFnCalendarDate) => { const state = store.getState(); if (state.disabled || state.readOnly) return; const isValid = valid(value); if (controlled) store.patchState({ requestedValue: value, editing: true, valid: isValid, message: isValid ? '' : invalidMessage }); else store.patchState({ value, requestedValue: undefined, displayValue: displayDate(value, locale, calendar), editing: true, valid: isValid, message: isValid ? '' : invalidMessage }); if (isValid) props.onValueChange?.(value); };
  const actions: DateInputActions = { focusSegment(segment) { store.patchState({ focusedSegment: segment, editing: true }); }, editSegment(segment, value) { commit(setUIFnDateSegment(store.getState().value, segment, value)); }, increment(segment = store.getState().focusedSegment) { const value = store.getState().value; commit(segment === 'day' ? addUIFnDateDays(value, 1) : segment === 'month' ? addUIFnDateMonths(value, 1) : setUIFnDateSegment(value, 'year', value.year + 1)); }, decrement(segment = store.getState().focusedSegment) { const value = store.getState().value; commit(segment === 'day' ? addUIFnDateDays(value, -1) : segment === 'month' ? addUIFnDateMonths(value, -1) : setUIFnDateSegment(value, 'year', value.year - 1)); }, commit() { store.patchState({ editing: false }); }, syncValue(value) { store.patchState({ value, requestedValue: undefined, displayValue: displayDate(value, locale, calendar), valid: valid(value), message: valid(value) ? '' : invalidMessage }); }, reset: () => actions.syncValue(props.defaultValue ?? createUIFnCalendarDate(1970, 1, 1)) };
  const parts: DateInputControllerParts = {
    root: createUIFnPhase10Part('DateInput', 'root', () => ({ role: 'group', id: id('root'), aria: { labelledby: id('label'), invalid: !store.getState().valid, errormessage: !store.getState().valid ? id('error') : undefined }, data: { state: store.getState().editing ? 'editing' : store.getState().valid ? 'idle' : 'invalid', locale, calendar } }), { role: true, id: true }), label: createUIFnPhase10Part('DateInput', 'label', () => ({ id: id('label') }), { id: true }),
    segment: createUIFnPhase10ValuePart('DateInput', 'segment', (segment) => ({ role: 'spinbutton', id: id('segment', segment), tabIndex: store.getState().focusedSegment === segment ? 0 : -1, aria: { label: props.messages?.segments?.[segment] ?? segment, valuenow: segmentValue(store.getState().value, segment), valuetext: new Intl.NumberFormat(locale, { useGrouping: false }).format(segmentValue(store.getState().value, segment)), readonly: store.getState().readOnly, disabled: store.getState().disabled }, data: { segment, state: store.getState().focusedSegment === segment ? 'focused' : 'idle' }, on: { focus: () => actions.focusSegment(segment), keydown: (event) => { if (event?.key === 'ArrowUp') actions.increment(segment); if (event?.key === 'ArrowDown') actions.decrement(segment); } } }), { role: true, id: true, tabIndex: true, aria: ['label', 'valuenow', 'valuetext'] }), hiddenInput: createUIFnPhase10Part('DateInput', 'hiddenInput', () => ({ id: id('input'), attributes: { type: 'hidden', name: props.name, value: serializeUIFnDate(store.getState().value), disabled: store.getState().disabled } }), { id: true }), error: createUIFnPhase10Part('DateInput', 'error', () => ({ role: 'alert', id: id('error'), data: { message: store.getState().message }, hidden: store.getState().valid }), { role: true, id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); } });
}

export interface DatePickerProps extends DateInputProps { readonly open?: boolean; readonly defaultOpen?: boolean; readonly unavailable?: (value: UIFnCalendarDate) => boolean; readonly onOpenChange?: (open: boolean) => void }
export interface DatePickerState extends DateInputState { readonly open: boolean; readonly requestedOpen?: boolean; readonly visibleMonth: UIFnCalendarDate; readonly grid: readonly UIFnCalendarDate[]; readonly focusedDate: UIFnCalendarDate }
export interface DatePickerActions extends DateInputActions { setOpen(open: boolean): void; syncOpen(open: boolean): void; navigateMonth(amount: number): void; navigateGrid(key: string): void; selectDate(value: UIFnCalendarDate): void; focusDate(value: UIFnCalendarDate): void }
export interface DatePickerControllerParts { readonly root: UIFnPhase10Part; readonly label: UIFnPhase10Part; readonly input: UIFnPhase10Part; readonly segment: UIFnPhase10ValuePart<UIFnDateSegment>; readonly trigger: UIFnPhase10Part; readonly positioner: UIFnPhase10Part; readonly content: UIFnPhase10Part; readonly header: UIFnPhase10Part; readonly previous: UIFnPhase10Part; readonly next: UIFnPhase10Part; readonly grid: UIFnPhase10Part; readonly gridLabel: UIFnPhase10Part; readonly cell: UIFnPhase10ValuePart<string>; readonly cellTrigger: UIFnPhase10ValuePart<string>; readonly hiddenInput: UIFnPhase10Part }
export type DatePickerController = UIFnController<DatePickerState, DatePickerActions, DatePickerControllerParts, DatePickerProps>;
export function createDatePickerController(props: DatePickerProps = {}, env: UIFnEnvironment = {}): DatePickerController {
  const { resolved, id } = createUIFnPhase10Ids('DatePicker', 'date-picker', env); const locale = props.locale ?? resolved.getLocale(); const timeZone = props.timeZone ?? resolved.getTimeZone(); const calendar = props.calendar ?? 'gregory'; const valueControlled = props.value !== undefined; const openControlled = props.open !== undefined; const initial = props.value ?? props.defaultValue ?? createUIFnCalendarDate(1970, 1, 1); const first = createUIFnCalendarDate(initial.year, initial.month, 1); const available = (value: UIFnCalendarDate) => isUIFnDateAvailable(value, { min: props.min, max: props.max, unavailable: props.unavailable }); const invalidMessage = props.messages?.invalid ?? '';
  const store = createStateChannel<DatePickerState>({ value: initial, locale, timeZone, calendar, displayValue: displayDate(initial, locale, calendar), focusedSegment: 'day', editing: false, valid: available(initial), message: available(initial) ? '' : invalidMessage, disabled: props.disabled ?? false, readOnly: props.readOnly ?? false, open: props.open ?? props.defaultOpen ?? false, visibleMonth: first, grid: createUIFnMonthGrid(first, locale), focusedDate: initial });
  const setValue = (value: UIFnCalendarDate) => { const state = store.getState(); const isValid = available(value); if (!isValid || state.disabled || state.readOnly) { store.patchState({ valid: false, message: invalidMessage }); return; } if (valueControlled) store.patchState({ requestedValue: value, focusedDate: value, valid: true, message: '' }); else store.patchState({ value, requestedValue: undefined, displayValue: displayDate(value, locale, calendar), focusedDate: value, valid: true, message: '' }); props.onValueChange?.(value); };
  const actions: DatePickerActions = {
    setOpen(open) { if (store.getState().disabled) return; if (openControlled) store.patchState({ requestedOpen: open }); else store.patchState({ open, requestedOpen: undefined }); props.onOpenChange?.(open); }, syncOpen(open) { store.patchState({ open, requestedOpen: undefined }); },
    focusSegment(segment) { store.patchState({ focusedSegment: segment, editing: true }); }, editSegment(segment, value) { setValue(setUIFnDateSegment(store.getState().value, segment, value)); }, increment(segment = store.getState().focusedSegment) { const value = store.getState().value; setValue(segment === 'day' ? addUIFnDateDays(value, 1) : segment === 'month' ? addUIFnDateMonths(value, 1) : setUIFnDateSegment(value, 'year', value.year + 1)); }, decrement(segment = store.getState().focusedSegment) { const value = store.getState().value; setValue(segment === 'day' ? addUIFnDateDays(value, -1) : segment === 'month' ? addUIFnDateMonths(value, -1) : setUIFnDateSegment(value, 'year', value.year - 1)); }, commit() { store.patchState({ editing: false }); }, syncValue(value) { store.patchState({ value, requestedValue: undefined, displayValue: displayDate(value, locale, calendar), focusedDate: value, valid: available(value), message: available(value) ? '' : invalidMessage }); }, reset() { actions.syncValue(props.defaultValue ?? createUIFnCalendarDate(1970, 1, 1)); actions.syncOpen(props.defaultOpen ?? false); },
    navigateMonth(amount) { const visibleMonth = addUIFnDateMonths(store.getState().visibleMonth, amount); store.patchState({ visibleMonth, grid: createUIFnMonthGrid(visibleMonth, locale) }); },
    navigateGrid(key) { const state = store.getState(); const amount = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : key === 'ArrowDown' ? 7 : key === 'ArrowUp' ? -7 : key === 'PageDown' ? 28 : key === 'PageUp' ? -28 : 0; let focused = addUIFnDateDays(state.focusedDate, amount); const direction = Math.sign(amount) || 1; while (!available(focused) && compareUIFnDates(focused, props.min ?? createUIFnCalendarDate(0, 1, 1)) >= 0 && compareUIFnDates(focused, props.max ?? createUIFnCalendarDate(9999, 12, 31)) <= 0) focused = addUIFnDateDays(focused, direction); const visibleMonth = createUIFnCalendarDate(focused.year, focused.month, 1); store.patchState({ focusedDate: focused, visibleMonth, grid: createUIFnMonthGrid(visibleMonth, locale) }); },
    selectDate(value) { if (!available(value)) return; setValue(value); actions.setOpen(false); }, focusDate(value) { if (available(value)) store.patchState({ focusedDate: value }); },
  };
  const dateFor = (key: string) => { const [year, month, day] = key.split('-').map(Number); return createUIFnCalendarDate(year, month, day); };
  const parts: DatePickerControllerParts = {
    root: createUIFnPhase10Part('DatePicker', 'root', () => ({ id: id('root'), data: { state: store.getState().open ? 'open' : 'closed', locale, calendar } }), { id: true }), label: createUIFnPhase10Part('DatePicker', 'label', () => ({ id: id('label') }), { id: true }), input: createUIFnPhase10Part('DatePicker', 'input', () => ({ role: 'group', id: id('input'), aria: { labelledby: id('label') } }), { role: true, id: true }),
    segment: createUIFnPhase10ValuePart('DatePicker', 'segment', (segment) => ({ role: 'spinbutton', id: id('segment', segment), tabIndex: store.getState().focusedSegment === segment ? 0 : -1, aria: { label: props.messages?.segments?.[segment] ?? segment, valuenow: segmentValue(store.getState().value, segment), valuetext: new Intl.NumberFormat(locale, { useGrouping: false }).format(segmentValue(store.getState().value, segment)) }, on: { focus: () => actions.focusSegment(segment), keydown: (event) => { if (event?.key === 'ArrowUp') actions.increment(segment); if (event?.key === 'ArrowDown') actions.decrement(segment); } } }), { role: true, id: true, tabIndex: true, aria: ['label', 'valuenow', 'valuetext'] }),
    trigger: createUIFnPhase10Part('DatePicker', 'trigger', () => ({ role: 'button', id: id('trigger'), aria: { expanded: store.getState().open, controls: id('content') }, on: { click: () => actions.setOpen(!store.getState().open) } }), { role: true, id: true, aria: ['expanded', 'controls'] }), positioner: createUIFnPhase10Part('DatePicker', 'positioner', () => ({ id: id('positioner'), hidden: !store.getState().open }), { id: true }), content: createUIFnPhase10Part('DatePicker', 'content', () => ({ role: 'dialog', id: id('content'), aria: { labelledby: id('grid-label') }, hidden: !store.getState().open }), { role: true, id: true }), header: createUIFnPhase10Part('DatePicker', 'header', () => ({ id: id('header'), data: { month: serializeUIFnDate(store.getState().visibleMonth) } }), { id: true }), previous: createUIFnPhase10Part('DatePicker', 'previous', () => ({ role: 'button', id: id('previous'), on: { click: () => actions.navigateMonth(-1) } }), { role: true, id: true }), next: createUIFnPhase10Part('DatePicker', 'next', () => ({ role: 'button', id: id('next'), on: { click: () => actions.navigateMonth(1) } }), { role: true, id: true }),
    grid: createUIFnPhase10Part('DatePicker', 'grid', () => ({ role: 'grid', id: id('grid'), aria: { labelledby: id('grid-label') }, on: { keydown: (event) => actions.navigateGrid(event?.key ?? '') } }), { role: true, id: true }), gridLabel: createUIFnPhase10Part('DatePicker', 'gridLabel', () => ({ id: id('grid-label'), data: { value: displayDate(store.getState().visibleMonth, locale, calendar) } }), { id: true }),
    cell: createUIFnPhase10ValuePart('DatePicker', 'cell', (key) => ({ role: 'gridcell', id: id('cell', key), aria: { selected: compareUIFnDates(store.getState().value, dateFor(key)) === 0, disabled: !available(dateFor(key)) }, data: { outside: dateFor(key).month !== store.getState().visibleMonth.month } }), { role: true, id: true }),
    cellTrigger: createUIFnPhase10ValuePart('DatePicker', 'cellTrigger', (key) => { const value = dateFor(key); const availableValue = available(value); return { role: 'button', id: id('cell-trigger', key), tabIndex: compareUIFnDates(store.getState().focusedDate, value) === 0 ? 0 : -1, aria: { label: displayDate(value, locale, calendar), disabled: !availableValue, current: compareUIFnDates(store.getState().value, value) === 0 ? 'date' : undefined }, disabled: !availableValue, on: { focus: () => actions.focusDate(value), click: () => actions.selectDate(value) } }; }, { role: true, id: true, tabIndex: true, aria: ['label'] }), hiddenInput: createUIFnPhase10Part('DatePicker', 'hiddenInput', () => ({ id: id('hidden-input'), attributes: { type: 'hidden', name: props.name, value: serializeUIFnDate(store.getState().value), disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.value !== undefined) actions.syncValue(inputs.value); if (inputs.open !== undefined) actions.syncOpen(inputs.open); } });
}

export interface TimerProps { readonly duration: number; readonly remaining?: number; readonly defaultRemaining?: number; readonly direction?: 'down' | 'up'; readonly autoStart?: boolean; readonly announceInterval?: number; readonly locale?: string; readonly onRemainingChange?: (remaining: number) => void; readonly onComplete?: () => void }
export interface TimerState { readonly duration: number; readonly remaining: number; readonly requestedRemaining?: number; readonly direction: 'down' | 'up'; readonly status: 'idle' | 'running' | 'paused' | 'complete'; readonly startedAt: number | null; readonly anchorRemaining: number; readonly pauseReasons: readonly string[]; readonly displayValue: string; readonly announcement?: string; readonly announcementCount: number; readonly completedCallbacks: number }
export interface TimerActions { start(): void; pause(reason?: string): void; resume(reason?: string): void; reset(): void; tick(): void; visibilityChange(hidden: boolean): void; syncRemaining(value: number): void }
export interface TimerControllerParts { readonly root: UIFnPhase10Part; readonly value: UIFnPhase10Part; readonly start: UIFnPhase10Part; readonly pause: UIFnPhase10Part; readonly reset: UIFnPhase10Part; readonly status: UIFnPhase10Part }
export type TimerController = UIFnController<TimerState, TimerActions, TimerControllerParts, TimerProps>;
function finiteTimerValue(value: number, field: string): number {
  if (Number.isFinite(value) && value >= 0) return value;
  throw createUIFnError({
    code: 'UIFN_ERR_INVALID_VALUE',
    component: 'Timer',
    message: 'Timer duration, remaining time, and announcement intervals must be finite non-negative numbers.',
    details: { field, value },
  });
}
export function createTimerController(props: TimerProps, env: UIFnEnvironment = {}): TimerController {
  const resolved = createUIFnEnvironment(env); const { id } = createUIFnPhase10Ids('Timer', 'timer', env); const duration = finiteTimerValue(props.duration, 'duration'); const controlled = props.remaining !== undefined; const direction = props.direction ?? 'down'; const initialValue = props.remaining ?? props.defaultRemaining ?? (direction === 'down' ? duration : 0); const initial = Math.min(duration, finiteTimerValue(initialValue, 'remaining')); const locale = props.locale ?? resolved.getLocale(); const format = (value: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value / 1000); const announceEvery = Math.max(250, finiteTimerValue(props.announceInterval ?? 1000, 'announceInterval'));
  const store = createStateChannel<TimerState>({ duration, remaining: initial, direction, status: props.autoStart ? 'running' : 'idle', startedAt: props.autoStart ? resolved.now() : null, anchorRemaining: initial, pauseReasons: Object.freeze([]), displayValue: format(initial), announcementCount: 0, completedCallbacks: 0 });
  let timer: unknown; let lastAnnouncement = resolved.now(); const clear = () => { if (timer !== undefined) resolved.scheduler.clearTimeout(timer); timer = undefined; };
  const schedule = () => { clear(); const state = store.getState(); if (state.status !== 'running') return; const elapsed = Math.max(0, resolved.now() - (state.startedAt ?? resolved.now())); const authoritativeRemaining = direction === 'down' ? state.anchorRemaining - elapsed : duration - (state.anchorRemaining + elapsed); const nextBoundary = Math.min(100, Math.max(1, authoritativeRemaining)); timer = resolved.scheduler.setTimeout(() => { timer = undefined; actions.tick(); schedule(); }, nextBoundary); };
  const publish = (remaining: number) => { const state = store.getState(); const clamped = Math.max(0, Math.min(duration, remaining)); const complete = direction === 'down' ? clamped <= 0 : clamped >= duration; const shouldAnnounce = resolved.now() - lastAnnouncement >= announceEvery || complete; if (shouldAnnounce) lastAnnouncement = resolved.now(); if (controlled) store.patchState({ requestedRemaining: clamped, announcement: shouldAnnounce ? format(clamped) : state.announcement, announcementCount: state.announcementCount + (shouldAnnounce ? 1 : 0) }); else store.patchState({ remaining: clamped, requestedRemaining: undefined, displayValue: format(clamped), announcement: shouldAnnounce ? format(clamped) : state.announcement, announcementCount: state.announcementCount + (shouldAnnounce ? 1 : 0), status: complete ? 'complete' : state.status }); props.onRemainingChange?.(clamped); if (complete && state.status !== 'complete') { clear(); store.patchState({ status: 'complete', completedCallbacks: state.completedCallbacks + 1 }); props.onComplete?.(); } };
  const actions: TimerActions = {
    start() { const state = store.getState(); if (state.status === 'running') return; store.patchState({ status: 'running', startedAt: resolved.now(), anchorRemaining: state.remaining, pauseReasons: Object.freeze([]) }); schedule(); },
    pause(reason = 'manual') { const state = store.getState(); if (state.status === 'running') actions.tick(); const current = store.getState(); const pauseReasons = Object.freeze([...new Set([...current.pauseReasons, reason])]); clear(); store.patchState({ status: current.status === 'complete' ? 'complete' : 'paused', startedAt: null, anchorRemaining: current.remaining, pauseReasons }); },
    resume(reason = 'manual') { const state = store.getState(); const pauseReasons = Object.freeze(state.pauseReasons.filter((entry) => entry !== reason)); if (pauseReasons.length || state.status === 'complete') { store.patchState({ pauseReasons }); return; } store.patchState({ status: 'running', startedAt: resolved.now(), anchorRemaining: state.remaining, pauseReasons }); schedule(); },
    reset() { clear(); const remaining = Math.max(0, Math.min(duration, props.defaultRemaining ?? (direction === 'down' ? duration : 0))); store.patchState({ remaining, requestedRemaining: undefined, displayValue: format(remaining), status: 'idle', startedAt: null, anchorRemaining: remaining, pauseReasons: Object.freeze([]), announcement: undefined }); },
    tick() { const state = store.getState(); if (state.status !== 'running' || state.startedAt === null) return; const elapsed = Math.max(0, resolved.now() - state.startedAt); publish(direction === 'down' ? state.anchorRemaining - elapsed : state.anchorRemaining + elapsed); },
    visibilityChange(hidden) { hidden ? actions.pause('visibility') : actions.resume('visibility'); }, syncRemaining(value) { const remaining = Math.min(duration, finiteTimerValue(value, 'remaining')); store.patchState({ remaining, requestedRemaining: undefined, displayValue: format(remaining), anchorRemaining: remaining, startedAt: store.getState().status === 'running' ? resolved.now() : null }); },
  };
  const parts: TimerControllerParts = {
    root: createUIFnPhase10Part('Timer', 'root', () => ({ id: id('root'), role: 'group', data: { state: store.getState().status, direction } }), { id: true, role: true }), value: createUIFnPhase10Part('Timer', 'value', () => ({ id: id('value'), attributes: { datetime: `PT${Math.ceil(store.getState().remaining / 1000)}S` }, data: { value: store.getState().displayValue } }), { id: true }), start: createUIFnPhase10Part('Timer', 'start', () => ({ role: 'button', id: id('start'), disabled: store.getState().status === 'running', on: { click: actions.start } }), { role: true, id: true }), pause: createUIFnPhase10Part('Timer', 'pause', () => ({ role: 'button', id: id('pause'), disabled: store.getState().status !== 'running', on: { click: () => actions.pause() } }), { role: true, id: true }), reset: createUIFnPhase10Part('Timer', 'reset', () => ({ role: 'button', id: id('reset'), on: { click: actions.reset } }), { role: true, id: true }), status: createUIFnPhase10Part('Timer', 'status', () => ({ role: 'status', id: id('status'), aria: { live: 'polite', atomic: true }, data: { message: store.getState().announcement } }), { role: true, id: true, aria: ['live'] }),
  };
  if (props.autoStart) schedule(); return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { if (inputs.remaining !== undefined) actions.syncRemaining(inputs.remaining); }, destroy: clear });
}
