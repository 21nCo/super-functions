'use client';

import * as React from 'react';
import { createCheckboxController, type CheckboxProps, type CheckboxController } from '@uifn/core/primitives/checkbox';
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

const CheckboxContext = React.createContext<ReactPrimitiveBridge<CheckboxProps> | null>(null);
const CheckboxDefinition: ReactPrimitiveDefinition<CheckboxProps> = {
  name: 'Checkbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  context: CheckboxContext,
  createController: createCheckboxController as never,
};

export type CheckboxRootProps = ReactPrimitiveRootProps<CheckboxProps, 'label'>;
export const CheckboxRoot = React.forwardRef<React.ElementRef<'label'>, CheckboxRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CheckboxDefinition} element="label" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxRoot.displayName = 'CheckboxRoot';

export type CheckboxControlProps = ReactPrimitivePartProps<CheckboxController['parts']['control'], 'button', false>;
export const CheckboxControl = React.forwardRef<React.ElementRef<'button'>, CheckboxControlProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxDefinition as never} part="control" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxControl.displayName = 'CheckboxControl';

export type CheckboxIndicatorProps = ReactPrimitivePartProps<CheckboxController['parts']['indicator'], 'span', false>;
export const CheckboxIndicator = React.forwardRef<React.ElementRef<'span'>, CheckboxIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxDefinition as never} part="indicator" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxIndicator.displayName = 'CheckboxIndicator';

export type CheckboxLabelProps = ReactPrimitivePartProps<CheckboxController['parts']['label'], 'span', false>;
export const CheckboxLabel = React.forwardRef<React.ElementRef<'span'>, CheckboxLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxLabel.displayName = 'CheckboxLabel';

export type CheckboxHiddenInputProps = ReactPrimitivePartProps<CheckboxController['parts']['hiddenInput'], 'input', false>;
export const CheckboxHiddenInput = React.forwardRef<React.ElementRef<'input'>, CheckboxHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxHiddenInput.displayName = 'CheckboxHiddenInput';

export const CheckboxProvider = CheckboxRoot;
export function useCheckbox(inputs: CheckboxProps = {} as CheckboxProps): ReactPrimitiveHookResult<CheckboxController['state'], CheckboxController['actions']> {
  return useReactPrimitive(CheckboxDefinition, inputs) as ReactPrimitiveHookResult<CheckboxController['state'], CheckboxController['actions']>;
}
export const Checkbox = Object.assign(CheckboxRoot, { Provider: CheckboxProvider, Root: CheckboxRoot, Control: CheckboxControl, Indicator: CheckboxIndicator, Label: CheckboxLabel, HiddenInput: CheckboxHiddenInput });
