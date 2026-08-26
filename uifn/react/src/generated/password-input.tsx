'use client';

import * as React from 'react';
import { createPasswordInputController, type PasswordInputProps, type PasswordInputController } from '@uifn/core/primitives/password-input';
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

const PasswordInputContext = React.createContext<ReactPrimitiveBridge<PasswordInputProps> | null>(null);
const PasswordInputDefinition: ReactPrimitiveDefinition<PasswordInputProps> = {
  name: 'PasswordInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","visible","name","autocomplete","disabled","readOnly","required"],
  context: PasswordInputContext,
  createController: createPasswordInputController as never,
};

export type PasswordInputRootProps = ReactPrimitiveRootProps<PasswordInputProps, 'div'>;
export const PasswordInputRoot = React.forwardRef<React.ElementRef<'div'>, PasswordInputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={PasswordInputDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputRoot.displayName = 'PasswordInputRoot';

export type PasswordInputLabelProps = ReactPrimitivePartProps<PasswordInputController['parts']['label'], 'label', false>;
export const PasswordInputLabel = React.forwardRef<React.ElementRef<'label'>, PasswordInputLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={PasswordInputDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputLabel.displayName = 'PasswordInputLabel';

export type PasswordInputInputProps = ReactPrimitivePartProps<PasswordInputController['parts']['input'], 'input', false>;
export const PasswordInputInput = React.forwardRef<React.ElementRef<'input'>, PasswordInputInputProps>((props, ref) => (
  <ReactPrimitivePart definition={PasswordInputDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputInput.displayName = 'PasswordInputInput';

export type PasswordInputVisibilityTriggerProps = ReactPrimitivePartProps<PasswordInputController['parts']['visibilityTrigger'], 'button', false>;
export const PasswordInputVisibilityTrigger = React.forwardRef<React.ElementRef<'button'>, PasswordInputVisibilityTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={PasswordInputDefinition as never} part="visibilityTrigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputVisibilityTrigger.displayName = 'PasswordInputVisibilityTrigger';

export type PasswordInputStrengthProps = ReactPrimitivePartProps<PasswordInputController['parts']['strength'], 'div', false>;
export const PasswordInputStrength = React.forwardRef<React.ElementRef<'div'>, PasswordInputStrengthProps>((props, ref) => (
  <ReactPrimitivePart definition={PasswordInputDefinition as never} part="strength" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputStrength.displayName = 'PasswordInputStrength';

export type PasswordInputErrorProps = ReactPrimitivePartProps<PasswordInputController['parts']['error'], 'div', false>;
export const PasswordInputError = React.forwardRef<React.ElementRef<'div'>, PasswordInputErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={PasswordInputDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PasswordInputError.displayName = 'PasswordInputError';

export const PasswordInputProvider = PasswordInputRoot;
export function usePasswordInput(inputs: PasswordInputProps = {} as PasswordInputProps): ReactPrimitiveHookResult<PasswordInputController['state'], PasswordInputController['actions']> {
  return useReactPrimitive(PasswordInputDefinition, inputs) as ReactPrimitiveHookResult<PasswordInputController['state'], PasswordInputController['actions']>;
}
export const PasswordInput = Object.assign(PasswordInputRoot, { Provider: PasswordInputProvider, Root: PasswordInputRoot, Label: PasswordInputLabel, Input: PasswordInputInput, VisibilityTrigger: PasswordInputVisibilityTrigger, Strength: PasswordInputStrength, Error: PasswordInputError });
