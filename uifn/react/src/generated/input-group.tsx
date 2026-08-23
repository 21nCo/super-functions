'use client';

import * as React from 'react';
import { InputGroupContract, type InputGroupProps, type InputGroupContractParts } from '@uifn/core/primitives/input-group';
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

const InputGroupContext = React.createContext<ReactPrimitiveBridge<InputGroupProps> | null>(null);
const InputGroupDefinition: ReactPrimitiveDefinition<InputGroupProps> = {
  name: 'InputGroup',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  context: InputGroupContext,
  contract: InputGroupContract as never,
};

export type InputGroupRootProps = ReactPrimitiveRootProps<InputGroupProps, 'div'>;
export const InputGroupRoot = React.forwardRef<React.ElementRef<'div'>, InputGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={InputGroupDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupRoot.displayName = 'InputGroupRoot';

export type InputGroupAddonProps = ReactPrimitivePartProps<InputGroupContractParts['addon'], 'div', true>;
export const InputGroupAddon = React.forwardRef<React.ElementRef<'div'>, InputGroupAddonProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="addon" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupAddon.displayName = 'InputGroupAddon';

export type InputGroupTextProps = ReactPrimitivePartProps<InputGroupContractParts['text'], 'span', true>;
export const InputGroupText = React.forwardRef<React.ElementRef<'span'>, InputGroupTextProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="text" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupText.displayName = 'InputGroupText';

export type InputGroupControlProps = ReactPrimitivePartProps<InputGroupContractParts['control'], 'div', false>;
export const InputGroupControl = React.forwardRef<React.ElementRef<'div'>, InputGroupControlProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupControl.displayName = 'InputGroupControl';

export type InputGroupInputProps = ReactPrimitivePartProps<InputGroupContractParts['input'], 'input', false>;
export const InputGroupInput = React.forwardRef<React.ElementRef<'input'>, InputGroupInputProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupInput.displayName = 'InputGroupInput';

export type InputGroupTextareaProps = ReactPrimitivePartProps<InputGroupContractParts['textarea'], 'textarea', false>;
export const InputGroupTextarea = React.forwardRef<React.ElementRef<'textarea'>, InputGroupTextareaProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="textarea" element="textarea" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupTextarea.displayName = 'InputGroupTextarea';

export type InputGroupButtonProps = ReactPrimitivePartProps<InputGroupContractParts['button'], 'button', true>;
export const InputGroupButton = React.forwardRef<React.ElementRef<'button'>, InputGroupButtonProps>((props, ref) => (
  <ReactPrimitivePart definition={InputGroupDefinition as never} part="button" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputGroupButton.displayName = 'InputGroupButton';

export const InputGroupProvider = InputGroupRoot;
export function useInputGroup(inputs: InputGroupProps = {} as InputGroupProps): ReactPrimitiveHookResult<ReturnType<typeof InputGroupContract.getState>, Record<string, never>> {
  return useReactPrimitive(InputGroupDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof InputGroupContract.getState>, Record<string, never>>;
}
export const InputGroup = Object.assign(InputGroupRoot, { Provider: InputGroupProvider, Root: InputGroupRoot, Addon: InputGroupAddon, Text: InputGroupText, Control: InputGroupControl, Input: InputGroupInput, Textarea: InputGroupTextarea, Button: InputGroupButton });
