'use client';

import * as React from 'react';
import { createDateInputController, type DateInputProps, type DateInputController } from '@uifn/core/primitives/date-input';
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

const DateInputContext = React.createContext<ReactPrimitiveBridge<DateInputProps> | null>(null);
const DateInputDefinition: ReactPrimitiveDefinition<DateInputProps> = {
  name: 'DateInput',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","locale","timeZone","min","max","name","disabled","readOnly"],
  context: DateInputContext,
  createController: createDateInputController as never,
};

export type DateInputRootProps = ReactPrimitiveRootProps<DateInputProps, 'div'>;
export const DateInputRoot = React.forwardRef<React.ElementRef<'div'>, DateInputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={DateInputDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DateInputRoot.displayName = 'DateInputRoot';

export type DateInputLabelProps = ReactPrimitivePartProps<DateInputController['parts']['label'], 'label', false>;
export const DateInputLabel = React.forwardRef<React.ElementRef<'label'>, DateInputLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={DateInputDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DateInputLabel.displayName = 'DateInputLabel';

export type DateInputSegmentProps = ReactPrimitivePartProps<DateInputController['parts']['segment'], 'span', true>;
export const DateInputSegment = React.forwardRef<React.ElementRef<'span'>, DateInputSegmentProps>((props, ref) => (
  <ReactPrimitivePart definition={DateInputDefinition as never} part="segment" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DateInputSegment.displayName = 'DateInputSegment';

export type DateInputHiddenInputProps = ReactPrimitivePartProps<DateInputController['parts']['hiddenInput'], 'input', false>;
export const DateInputHiddenInput = React.forwardRef<React.ElementRef<'input'>, DateInputHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={DateInputDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DateInputHiddenInput.displayName = 'DateInputHiddenInput';

export type DateInputErrorProps = ReactPrimitivePartProps<DateInputController['parts']['error'], 'div', false>;
export const DateInputError = React.forwardRef<React.ElementRef<'div'>, DateInputErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={DateInputDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DateInputError.displayName = 'DateInputError';

export const DateInputProvider = DateInputRoot;
export function useDateInput(inputs: DateInputProps = {} as DateInputProps): ReactPrimitiveHookResult<DateInputController['state'], DateInputController['actions']> {
  return useReactPrimitive(DateInputDefinition, inputs) as ReactPrimitiveHookResult<DateInputController['state'], DateInputController['actions']>;
}
export const DateInput = Object.assign(DateInputRoot, { Provider: DateInputProvider, Root: DateInputRoot, Label: DateInputLabel, Segment: DateInputSegment, HiddenInput: DateInputHiddenInput, Error: DateInputError });
