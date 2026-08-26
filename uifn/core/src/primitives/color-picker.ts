import type { UIFnController } from '../controller';
import type { UIFnEnvironment } from '../environment';
import { createStateChannel } from '../internal/runtime/state-channel';
import {
  colorUIFnDistance,
  hslaToUIFnRgba,
  parseUIFnColor,
  rgbaToUIFnHsla,
  serializeUIFnColor,
  type UIFnColor,
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
  let currentProps = props;
  const { id } = createUIFnPhase10Ids('ColorPicker', 'color-picker', env); const valueControlled = props.value !== undefined; const openControlled = props.open !== undefined; const space = props.colorSpace ?? 'srgb'; const initial = rgba(props.value ?? props.defaultValue ?? '#000000');
  const snapshot = (value: UIFnRgbaColor) => ({ value, serialized: serializeUIFnColor(value, currentProps.alpha ?? true), channels: colorChannels(value, currentProps.colorSpace ?? 'srgb'), roundTripError: colorUIFnDistance(value, parseUIFnColor(serializeUIFnColor(value, true))) });
  const store = createStateChannel<ColorPickerState>({ ...snapshot(initial), open: props.open ?? props.defaultOpen ?? false, colorSpace: space, alpha: props.alpha ?? true, disabled: props.disabled ?? false, readOnly: props.readOnly ?? false });
  const actions: ColorPickerActions = {
    setOpen(open) { if (store.getState().disabled) return; if (openControlled) store.patchState({ requestedOpen: open }); else store.patchState({ open, requestedOpen: undefined }); currentProps.onOpenChange?.(open); },
    syncOpen(open) { store.patchState({ open, requestedOpen: undefined }); },
    setValue(value) { const state = store.getState(); if (state.disabled || state.readOnly) return; const next = rgba(value); if (valueControlled) store.patchState({ requestedValue: next }); else store.patchState({ ...snapshot(next), requestedValue: undefined }); currentProps.onValueChange?.(next); },
    syncValue(value) { const next = rgba(value); store.patchState({ ...snapshot(next), requestedValue: undefined }); },
    setChannel(channel, channelValue) { const state = store.getState(); const nextValue = normalizeColorChannel(channel, channelValue); if (state.colorSpace === 'srgb') { const current = state.value; actions.setValue({ space: 'srgb', r: channel === 'r' ? nextValue : current.r, g: channel === 'g' ? nextValue : current.g, b: channel === 'b' ? nextValue : current.b, alpha: channel === 'alpha' ? nextValue : current.alpha }); } else { const current = rgbaToUIFnHsla(state.value); actions.setValue({ space: 'hsl', h: channel === 'h' ? nextValue : current.h, s: channel === 's' ? nextValue : current.s, l: channel === 'l' ? nextValue : current.l, alpha: channel === 'alpha' ? nextValue : current.alpha }); } },
    setArea(x, y) { const current = rgbaToUIFnHsla(store.getState().value); actions.setValue({ ...current, s: Math.max(0, Math.min(100, x)), l: Math.max(0, Math.min(100, 100 - y)) }); },
    reset() { actions.syncValue(currentProps.defaultValue ?? '#000000'); actions.syncOpen(currentProps.defaultOpen ?? false); },
  };
  const parts: ColorPickerControllerParts = {
    root: createUIFnPhase10Part('ColorPicker', 'root', () => ({ id: id('root'), data: { state: store.getState().open ? 'open' : 'closed', colorSpace: store.getState().colorSpace } }), { id: true }), label: createUIFnPhase10Part('ColorPicker', 'label', () => ({ id: id('label') }), { id: true }), control: createUIFnPhase10Part('ColorPicker', 'control', () => ({ id: id('control') }), { id: true }),
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
          label: currentProps.messages?.channels?.[channel] ?? ({ r: 'R', g: 'G', b: 'B', h: 'H', s: 'S', l: 'L', alpha: 'α' } as Record<string, string>)[channel],
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
    channelInput: createUIFnPhase10ValuePart('ColorPicker', 'channelInput', (channel) => ({ role: 'spinbutton', id: id('input', channel), aria: { valuenow: store.getState().channels[channel] ?? 0, label: currentProps.messages?.channels?.[channel] ?? ({ r: 'R', g: 'G', b: 'B', h: 'H', s: 'S', l: 'L', alpha: 'α' } as Record<string, string>)[channel] }, attributes: { value: store.getState().channels[channel] ?? 0 }, data: { channel }, on: { input: (event) => actions.setChannel(channel, Number(event?.value ?? 0)) } }), { role: true, id: true, aria: ['valuenow', 'label'] }), swatch: createUIFnPhase10Part('ColorPicker', 'swatch', () => ({ id: id('swatch'), style: { backgroundColor: store.getState().serialized }, data: { value: store.getState().serialized } }), { id: true }), hiddenInput: createUIFnPhase10Part('ColorPicker', 'hiddenInput', () => ({ id: id('hidden-input'), attributes: { type: 'hidden', name: currentProps.name, value: store.getState().serialized, disabled: store.getState().disabled } }), { id: true }),
  };
  return createUIFnPhase10Controller({ store, actions, parts, env, update(inputs) { currentProps = { ...currentProps, ...inputs }; const value = inputs.value === undefined ? store.getState().value : rgba(inputs.value); store.patchState({ ...snapshot(value), colorSpace: currentProps.colorSpace ?? 'srgb', alpha: currentProps.alpha ?? true, disabled: currentProps.disabled ?? false, readOnly: currentProps.readOnly ?? false }); if (inputs.value !== undefined) actions.syncValue(inputs.value); if (inputs.open !== undefined) actions.syncOpen(inputs.open); } });
}
