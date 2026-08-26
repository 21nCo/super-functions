'use client';

import * as React from 'react';
import { createRadioGroupController, type RadioGroupProps, type RadioGroupController } from '@uifn/core/primitives/radio-group';
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

const RadioGroupContext = React.createContext<ReactPrimitiveBridge<RadioGroupProps> | null>(null);
const RadioGroupDefinition: ReactPrimitiveDefinition<RadioGroupProps> = {
  name: 'RadioGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","loop","disabled","readOnly","required"],
  context: RadioGroupContext,
  createController: createRadioGroupController as never,
};

export type RadioGroupRootProps = ReactPrimitiveRootProps<RadioGroupProps, 'fieldset'>;
export const RadioGroupRoot = React.forwardRef<React.ElementRef<'fieldset'>, RadioGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={RadioGroupDefinition} element="fieldset" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupRoot.displayName = 'RadioGroupRoot';

export type RadioGroupLabelProps = ReactPrimitivePartProps<RadioGroupController['parts']['label'], 'legend', false>;
export const RadioGroupLabel = React.forwardRef<React.ElementRef<'legend'>, RadioGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="label" element="legend" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupLabel.displayName = 'RadioGroupLabel';

export type RadioGroupItemProps = ReactPrimitivePartProps<RadioGroupController['parts']['item'], 'label', true>;
export const RadioGroupItem = React.forwardRef<React.ElementRef<'label'>, RadioGroupItemProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="item" element="label" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupItem.displayName = 'RadioGroupItem';

export type RadioGroupItemControlProps = ReactPrimitivePartProps<RadioGroupController['parts']['itemControl'], 'button', true>;
export const RadioGroupItemControl = React.forwardRef<React.ElementRef<'button'>, RadioGroupItemControlProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="itemControl" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupItemControl.displayName = 'RadioGroupItemControl';

export type RadioGroupItemIndicatorProps = ReactPrimitivePartProps<RadioGroupController['parts']['itemIndicator'], 'span', true>;
export const RadioGroupItemIndicator = React.forwardRef<React.ElementRef<'span'>, RadioGroupItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupItemIndicator.displayName = 'RadioGroupItemIndicator';

export type RadioGroupHiddenInputProps = ReactPrimitivePartProps<RadioGroupController['parts']['hiddenInput'], 'input', true>;
export const RadioGroupHiddenInput = React.forwardRef<React.ElementRef<'input'>, RadioGroupHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupHiddenInput.displayName = 'RadioGroupHiddenInput';

export type RadioGroupErrorProps = ReactPrimitivePartProps<RadioGroupController['parts']['error'], 'div', false>;
export const RadioGroupError = React.forwardRef<React.ElementRef<'div'>, RadioGroupErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={RadioGroupDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
RadioGroupError.displayName = 'RadioGroupError';

export const RadioGroupProvider = RadioGroupRoot;
export function useRadioGroup(inputs: RadioGroupProps = {} as RadioGroupProps): ReactPrimitiveHookResult<RadioGroupController['state'], RadioGroupController['actions']> {
  return useReactPrimitive(RadioGroupDefinition, inputs) as ReactPrimitiveHookResult<RadioGroupController['state'], RadioGroupController['actions']>;
}
export const RadioGroup = Object.assign(RadioGroupRoot, { Provider: RadioGroupProvider, Root: RadioGroupRoot, Label: RadioGroupLabel, Item: RadioGroupItem, ItemControl: RadioGroupItemControl, ItemIndicator: RadioGroupItemIndicator, HiddenInput: RadioGroupHiddenInput, Error: RadioGroupError });
