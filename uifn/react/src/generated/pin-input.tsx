'use client';

import * as React from 'react';
import { createPinInputController, type PinInputProps, type PinInputController } from '@uifn/core/primitives/pin-input';
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

const PinInputContext = React.createContext<ReactPrimitiveBridge<PinInputProps> | null>(null);
const PinInputDefinition: ReactPrimitiveDefinition<PinInputProps> = {
  name: 'PinInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","length","mask","otp","name","disabled","readOnly","required"],
  context: PinInputContext,
  createController: createPinInputController as never,
};

export type PinInputRootProps = ReactPrimitiveRootProps<PinInputProps, 'div'>;
export const PinInputRoot = React.forwardRef<React.ElementRef<'div'>, PinInputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={PinInputDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputRoot.displayName = 'PinInputRoot';

export type PinInputLabelProps = ReactPrimitivePartProps<PinInputController['parts']['label'], 'label', false>;
export const PinInputLabel = React.forwardRef<React.ElementRef<'label'>, PinInputLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={PinInputDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputLabel.displayName = 'PinInputLabel';

export type PinInputControlProps = ReactPrimitivePartProps<PinInputController['parts']['control'], 'div', false>;
export const PinInputControl = React.forwardRef<React.ElementRef<'div'>, PinInputControlProps>((props, ref) => (
  <ReactPrimitivePart definition={PinInputDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputControl.displayName = 'PinInputControl';

export type PinInputInputProps = ReactPrimitivePartProps<PinInputController['parts']['input'], 'input', true>;
export const PinInputInput = React.forwardRef<React.ElementRef<'input'>, PinInputInputProps>((props, ref) => (
  <ReactPrimitivePart definition={PinInputDefinition as never} part="input" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputInput.displayName = 'PinInputInput';

export type PinInputHiddenInputProps = ReactPrimitivePartProps<PinInputController['parts']['hiddenInput'], 'input', false>;
export const PinInputHiddenInput = React.forwardRef<React.ElementRef<'input'>, PinInputHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={PinInputDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputHiddenInput.displayName = 'PinInputHiddenInput';

export type PinInputErrorProps = ReactPrimitivePartProps<PinInputController['parts']['error'], 'div', false>;
export const PinInputError = React.forwardRef<React.ElementRef<'div'>, PinInputErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={PinInputDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PinInputError.displayName = 'PinInputError';

export const PinInputProvider = PinInputRoot;
export function usePinInput(inputs: PinInputProps = {} as PinInputProps): ReactPrimitiveHookResult<PinInputController['state'], PinInputController['actions']> {
  return useReactPrimitive(PinInputDefinition, inputs) as ReactPrimitiveHookResult<PinInputController['state'], PinInputController['actions']>;
}
export const PinInput = Object.assign(PinInputRoot, { Provider: PinInputProvider, Root: PinInputRoot, Label: PinInputLabel, Control: PinInputControl, Input: PinInputInput, HiddenInput: PinInputHiddenInput, Error: PinInputError });
