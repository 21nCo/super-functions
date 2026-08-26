'use client';

import * as React from 'react';
import { createNumberInputController, type NumberInputProps, type NumberInputController } from '@uifn/core/primitives/number-input';
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

const NumberInputContext = React.createContext<ReactPrimitiveBridge<NumberInputProps> | null>(null);
const NumberInputDefinition: ReactPrimitiveDefinition<NumberInputProps> = {
  name: 'NumberInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","locale","name","disabled","readOnly","required"],
  context: NumberInputContext,
  createController: createNumberInputController as never,
};

export type NumberInputRootProps = ReactPrimitiveRootProps<NumberInputProps, 'div'>;
export const NumberInputRoot = React.forwardRef<React.ElementRef<'div'>, NumberInputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={NumberInputDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputRoot.displayName = 'NumberInputRoot';

export type NumberInputLabelProps = ReactPrimitivePartProps<NumberInputController['parts']['label'], 'label', false>;
export const NumberInputLabel = React.forwardRef<React.ElementRef<'label'>, NumberInputLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputLabel.displayName = 'NumberInputLabel';

export type NumberInputControlProps = ReactPrimitivePartProps<NumberInputController['parts']['control'], 'div', false>;
export const NumberInputControl = React.forwardRef<React.ElementRef<'div'>, NumberInputControlProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputControl.displayName = 'NumberInputControl';

export type NumberInputInputProps = ReactPrimitivePartProps<NumberInputController['parts']['input'], 'input', false>;
export const NumberInputInput = React.forwardRef<React.ElementRef<'input'>, NumberInputInputProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputInput.displayName = 'NumberInputInput';

export type NumberInputIncrementProps = ReactPrimitivePartProps<NumberInputController['parts']['increment'], 'button', false>;
export const NumberInputIncrement = React.forwardRef<React.ElementRef<'button'>, NumberInputIncrementProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="increment" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputIncrement.displayName = 'NumberInputIncrement';

export type NumberInputDecrementProps = ReactPrimitivePartProps<NumberInputController['parts']['decrement'], 'button', false>;
export const NumberInputDecrement = React.forwardRef<React.ElementRef<'button'>, NumberInputDecrementProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="decrement" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputDecrement.displayName = 'NumberInputDecrement';

export type NumberInputScrubberProps = ReactPrimitivePartProps<NumberInputController['parts']['scrubber'], 'div', false>;
export const NumberInputScrubber = React.forwardRef<React.ElementRef<'div'>, NumberInputScrubberProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="scrubber" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputScrubber.displayName = 'NumberInputScrubber';

export type NumberInputHiddenInputProps = ReactPrimitivePartProps<NumberInputController['parts']['hiddenInput'], 'input', false>;
export const NumberInputHiddenInput = React.forwardRef<React.ElementRef<'input'>, NumberInputHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputHiddenInput.displayName = 'NumberInputHiddenInput';

export type NumberInputErrorProps = ReactPrimitivePartProps<NumberInputController['parts']['error'], 'div', false>;
export const NumberInputError = React.forwardRef<React.ElementRef<'div'>, NumberInputErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={NumberInputDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NumberInputError.displayName = 'NumberInputError';

export const NumberInputProvider = NumberInputRoot;
export function useNumberInput(inputs: NumberInputProps = {} as NumberInputProps): ReactPrimitiveHookResult<NumberInputController['state'], NumberInputController['actions']> {
  return useReactPrimitive(NumberInputDefinition, inputs) as ReactPrimitiveHookResult<NumberInputController['state'], NumberInputController['actions']>;
}
export const NumberInput = Object.assign(NumberInputRoot, { Provider: NumberInputProvider, Root: NumberInputRoot, Label: NumberInputLabel, Control: NumberInputControl, Input: NumberInputInput, Increment: NumberInputIncrement, Decrement: NumberInputDecrement, Scrubber: NumberInputScrubber, HiddenInput: NumberInputHiddenInput, Error: NumberInputError });
