'use client';

import * as React from 'react';
import { createColorPickerController, type ColorPickerProps, type ColorPickerController } from '@uifn/core/primitives/color-picker';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const ColorPickerContext = React.createContext<ReactPrimitiveBridge<ColorPickerProps> | null>(null);
const ColorPickerDefinition: ReactPrimitiveDefinition<ColorPickerProps> = {
  name: 'ColorPicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","colorSpace","alpha","name","disabled","readOnly"],
  context: ColorPickerContext,
  createController: createColorPickerController as never,
};

export type ColorPickerRootProps = ReactPrimitiveRootProps<ColorPickerProps, 'div'>;
export const ColorPickerRoot = React.forwardRef<React.ElementRef<'div'>, ColorPickerRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ColorPickerDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerRoot.displayName = 'ColorPickerRoot';

export type ColorPickerLabelProps = ReactPrimitivePartProps<ColorPickerController['parts']['label'], 'label', false>;
export const ColorPickerLabel = React.forwardRef<React.ElementRef<'label'>, ColorPickerLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerLabel.displayName = 'ColorPickerLabel';

export type ColorPickerControlProps = ReactPrimitivePartProps<ColorPickerController['parts']['control'], 'div', false>;
export const ColorPickerControl = React.forwardRef<React.ElementRef<'div'>, ColorPickerControlProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerControl.displayName = 'ColorPickerControl';

export type ColorPickerTriggerProps = ReactPrimitivePartProps<ColorPickerController['parts']['trigger'], 'button', false>;
export const ColorPickerTrigger = React.forwardRef<React.ElementRef<'button'>, ColorPickerTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerTrigger.displayName = 'ColorPickerTrigger';

export type ColorPickerPositionerProps = ReactPrimitivePartProps<ColorPickerController['parts']['positioner'], 'div', false>;
export const ColorPickerPositioner = React.forwardRef<React.ElementRef<'div'>, ColorPickerPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerPositioner.displayName = 'ColorPickerPositioner';

export type ColorPickerContentProps = ReactPrimitivePartProps<ColorPickerController['parts']['content'], 'div', false>;
export const ColorPickerContent = React.forwardRef<React.ElementRef<'div'>, ColorPickerContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerContent.displayName = 'ColorPickerContent';

export type ColorPickerAreaProps = ReactPrimitivePartProps<ColorPickerController['parts']['area'], 'div', false>;
export const ColorPickerArea = React.forwardRef<React.ElementRef<'div'>, ColorPickerAreaProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="area" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerArea.displayName = 'ColorPickerArea';

export type ColorPickerAreaThumbProps = ReactPrimitivePartProps<ColorPickerController['parts']['areaThumb'], 'div', false>;
export const ColorPickerAreaThumb = React.forwardRef<React.ElementRef<'div'>, ColorPickerAreaThumbProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="areaThumb" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerAreaThumb.displayName = 'ColorPickerAreaThumb';

export type ColorPickerChannelSliderProps = ReactPrimitivePartProps<ColorPickerController['parts']['channelSlider'], 'div', true>;
export const ColorPickerChannelSlider = React.forwardRef<React.ElementRef<'div'>, ColorPickerChannelSliderProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="channelSlider" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerChannelSlider.displayName = 'ColorPickerChannelSlider';

export type ColorPickerChannelInputProps = ReactPrimitivePartProps<ColorPickerController['parts']['channelInput'], 'input', true>;
export const ColorPickerChannelInput = React.forwardRef<React.ElementRef<'input'>, ColorPickerChannelInputProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="channelInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerChannelInput.displayName = 'ColorPickerChannelInput';

export type ColorPickerSwatchProps = ReactPrimitivePartProps<ColorPickerController['parts']['swatch'], 'span', false>;
export const ColorPickerSwatch = React.forwardRef<React.ElementRef<'span'>, ColorPickerSwatchProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="swatch" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerSwatch.displayName = 'ColorPickerSwatch';

export type ColorPickerHiddenInputProps = ReactPrimitivePartProps<ColorPickerController['parts']['hiddenInput'], 'input', false>;
export const ColorPickerHiddenInput = React.forwardRef<React.ElementRef<'input'>, ColorPickerHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={ColorPickerDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ColorPickerHiddenInput.displayName = 'ColorPickerHiddenInput';

export const ColorPickerProvider = ColorPickerRoot;
export function useColorPicker(inputs: ColorPickerProps = {} as ColorPickerProps): ReactPrimitiveHookResult<ColorPickerController['state'], ColorPickerController['actions']> {
  return useReactPrimitive(ColorPickerDefinition, inputs) as ReactPrimitiveHookResult<ColorPickerController['state'], ColorPickerController['actions']>;
}
export const ColorPicker = Object.assign(ColorPickerRoot, { Provider: ColorPickerProvider, Root: ColorPickerRoot, Label: ColorPickerLabel, Control: ColorPickerControl, Trigger: ColorPickerTrigger, Positioner: ColorPickerPositioner, Content: ColorPickerContent, Area: ColorPickerArea, AreaThumb: ColorPickerAreaThumb, ChannelSlider: ColorPickerChannelSlider, ChannelInput: ColorPickerChannelInput, Swatch: ColorPickerSwatch, HiddenInput: ColorPickerHiddenInput });
