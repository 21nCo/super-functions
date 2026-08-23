'use client';

import * as React from 'react';
import { createAngleSliderController, type AngleSliderProps, type AngleSliderController } from '@uifn/core/primitives/angle-slider';
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

const AngleSliderContext = React.createContext<ReactPrimitiveBridge<AngleSliderProps> | null>(null);
const AngleSliderDefinition: ReactPrimitiveDefinition<AngleSliderProps> = {
  name: 'AngleSlider',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","disabled","readOnly"],
  context: AngleSliderContext,
  createController: createAngleSliderController as never,
};

export type AngleSliderRootProps = ReactPrimitiveRootProps<AngleSliderProps, 'div'>;
export const AngleSliderRoot = React.forwardRef<React.ElementRef<'div'>, AngleSliderRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={AngleSliderDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AngleSliderRoot.displayName = 'AngleSliderRoot';

export type AngleSliderTrackProps = ReactPrimitivePartProps<AngleSliderController['parts']['track'], 'div', false>;
export const AngleSliderTrack = React.forwardRef<React.ElementRef<'div'>, AngleSliderTrackProps>((props, ref) => (
  <ReactPrimitivePart definition={AngleSliderDefinition as never} part="track" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AngleSliderTrack.displayName = 'AngleSliderTrack';

export type AngleSliderThumbProps = ReactPrimitivePartProps<AngleSliderController['parts']['thumb'], 'div', false>;
export const AngleSliderThumb = React.forwardRef<React.ElementRef<'div'>, AngleSliderThumbProps>((props, ref) => (
  <ReactPrimitivePart definition={AngleSliderDefinition as never} part="thumb" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AngleSliderThumb.displayName = 'AngleSliderThumb';

export type AngleSliderValueTextProps = ReactPrimitivePartProps<AngleSliderController['parts']['valueText'], 'span', false>;
export const AngleSliderValueText = React.forwardRef<React.ElementRef<'span'>, AngleSliderValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={AngleSliderDefinition as never} part="valueText" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AngleSliderValueText.displayName = 'AngleSliderValueText';

export type AngleSliderHiddenInputProps = ReactPrimitivePartProps<AngleSliderController['parts']['hiddenInput'], 'input', false>;
export const AngleSliderHiddenInput = React.forwardRef<React.ElementRef<'input'>, AngleSliderHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={AngleSliderDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AngleSliderHiddenInput.displayName = 'AngleSliderHiddenInput';

export const AngleSliderProvider = AngleSliderRoot;
export function useAngleSlider(inputs: AngleSliderProps = {} as AngleSliderProps): ReactPrimitiveHookResult<AngleSliderController['state'], AngleSliderController['actions']> {
  return useReactPrimitive(AngleSliderDefinition, inputs) as ReactPrimitiveHookResult<AngleSliderController['state'], AngleSliderController['actions']>;
}
export const AngleSlider = Object.assign(AngleSliderRoot, { Provider: AngleSliderProvider, Root: AngleSliderRoot, Track: AngleSliderTrack, Thumb: AngleSliderThumb, ValueText: AngleSliderValueText, HiddenInput: AngleSliderHiddenInput });
