'use client';

import * as React from 'react';
import { createSliderController, type SliderProps, type SliderController } from '@uifn/core/primitives/slider';
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

const SliderContext = React.createContext<ReactPrimitiveBridge<SliderProps> | null>(null);
const SliderDefinition: ReactPrimitiveDefinition<SliderProps> = {
  name: 'Slider',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","minStepsBetweenThumbs","orientation","dir","name","disabled","readOnly"],
  context: SliderContext,
  createController: createSliderController as never,
};

export type SliderRootProps = ReactPrimitiveRootProps<SliderProps, 'div'>;
export const SliderRoot = React.forwardRef<React.ElementRef<'div'>, SliderRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SliderDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderRoot.displayName = 'SliderRoot';

export type SliderLabelProps = ReactPrimitivePartProps<SliderController['parts']['label'], 'label', false>;
export const SliderLabel = React.forwardRef<React.ElementRef<'label'>, SliderLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderLabel.displayName = 'SliderLabel';

export type SliderControlProps = ReactPrimitivePartProps<SliderController['parts']['control'], 'div', false>;
export const SliderControl = React.forwardRef<React.ElementRef<'div'>, SliderControlProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderControl.displayName = 'SliderControl';

export type SliderTrackProps = ReactPrimitivePartProps<SliderController['parts']['track'], 'div', false>;
export const SliderTrack = React.forwardRef<React.ElementRef<'div'>, SliderTrackProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="track" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderTrack.displayName = 'SliderTrack';

export type SliderRangeProps = ReactPrimitivePartProps<SliderController['parts']['range'], 'div', false>;
export const SliderRange = React.forwardRef<React.ElementRef<'div'>, SliderRangeProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="range" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderRange.displayName = 'SliderRange';

export type SliderThumbProps = ReactPrimitivePartProps<SliderController['parts']['thumb'], 'div', true>;
export const SliderThumb = React.forwardRef<React.ElementRef<'div'>, SliderThumbProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="thumb" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderThumb.displayName = 'SliderThumb';

export type SliderValueTextProps = ReactPrimitivePartProps<SliderController['parts']['valueText'], 'span', true>;
export const SliderValueText = React.forwardRef<React.ElementRef<'span'>, SliderValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="valueText" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderValueText.displayName = 'SliderValueText';

export type SliderHiddenInputProps = ReactPrimitivePartProps<SliderController['parts']['hiddenInput'], 'input', true>;
export const SliderHiddenInput = React.forwardRef<React.ElementRef<'input'>, SliderHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={SliderDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SliderHiddenInput.displayName = 'SliderHiddenInput';

export const SliderProvider = SliderRoot;
export function useSlider(inputs: SliderProps = {} as SliderProps): ReactPrimitiveHookResult<SliderController['state'], SliderController['actions']> {
  return useReactPrimitive(SliderDefinition, inputs) as ReactPrimitiveHookResult<SliderController['state'], SliderController['actions']>;
}
export const Slider = Object.assign(SliderRoot, { Provider: SliderProvider, Root: SliderRoot, Label: SliderLabel, Control: SliderControl, Track: SliderTrack, Range: SliderRange, Thumb: SliderThumb, ValueText: SliderValueText, HiddenInput: SliderHiddenInput });
