'use client';

import * as React from 'react';
import { ButtonContract, type ButtonProps, type ButtonContractParts } from '@uifn/core/primitives/button';
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

const ButtonContext = React.createContext<ReactPrimitiveBridge<ButtonProps> | null>(null);
const ButtonDefinition: ReactPrimitiveDefinition<ButtonProps> = {
  name: 'Button',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","disabled","loading","pressed"],
  context: ButtonContext,
  contract: ButtonContract as never,
};

export type ButtonRootProps = ReactPrimitiveRootProps<ButtonProps, 'button'>;
export const ButtonRoot = React.forwardRef<React.ElementRef<'button'>, ButtonRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ButtonDefinition} element="button" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ButtonRoot.displayName = 'ButtonRoot';

export type ButtonIconProps = ReactPrimitivePartProps<ButtonContractParts['icon'], 'span', false>;
export const ButtonIcon = React.forwardRef<React.ElementRef<'span'>, ButtonIconProps>((props, ref) => (
  <ReactPrimitivePart definition={ButtonDefinition as never} part="icon" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ButtonIcon.displayName = 'ButtonIcon';

export type ButtonLabelProps = ReactPrimitivePartProps<ButtonContractParts['label'], 'span', false>;
export const ButtonLabel = React.forwardRef<React.ElementRef<'span'>, ButtonLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ButtonDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ButtonLabel.displayName = 'ButtonLabel';

export type ButtonSpinnerProps = ReactPrimitivePartProps<ButtonContractParts['spinner'], 'span', false>;
export const ButtonSpinner = React.forwardRef<React.ElementRef<'span'>, ButtonSpinnerProps>((props, ref) => (
  <ReactPrimitivePart definition={ButtonDefinition as never} part="spinner" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ButtonSpinner.displayName = 'ButtonSpinner';

export const ButtonProvider = ButtonRoot;
export function useButton(inputs: ButtonProps = {} as ButtonProps): ReactPrimitiveHookResult<ReturnType<typeof ButtonContract.getState>, Record<string, never>> {
  return useReactPrimitive(ButtonDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof ButtonContract.getState>, Record<string, never>>;
}
export const Button = Object.assign(ButtonRoot, { Provider: ButtonProvider, Root: ButtonRoot, Icon: ButtonIcon, Label: ButtonLabel, Spinner: ButtonSpinner });
