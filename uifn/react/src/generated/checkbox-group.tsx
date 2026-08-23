'use client';

import * as React from 'react';
import { createCheckboxGroupController, type CheckboxGroupProps, type CheckboxGroupController } from '@uifn/core/primitives/checkbox-group';
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

const CheckboxGroupContext = React.createContext<ReactPrimitiveBridge<CheckboxGroupProps> | null>(null);
const CheckboxGroupDefinition: ReactPrimitiveDefinition<CheckboxGroupProps> = {
  name: 'CheckboxGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  context: CheckboxGroupContext,
  createController: createCheckboxGroupController as never,
};

export type CheckboxGroupRootProps = ReactPrimitiveRootProps<CheckboxGroupProps, 'fieldset'>;
export const CheckboxGroupRoot = React.forwardRef<React.ElementRef<'fieldset'>, CheckboxGroupRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CheckboxGroupDefinition} element="fieldset" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupRoot.displayName = 'CheckboxGroupRoot';

export type CheckboxGroupLabelProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['label'], 'legend', false>;
export const CheckboxGroupLabel = React.forwardRef<React.ElementRef<'legend'>, CheckboxGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="label" element="legend" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupLabel.displayName = 'CheckboxGroupLabel';

export type CheckboxGroupItemProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['item'], 'label', true>;
export const CheckboxGroupItem = React.forwardRef<React.ElementRef<'label'>, CheckboxGroupItemProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="item" element="label" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupItem.displayName = 'CheckboxGroupItem';

export type CheckboxGroupItemControlProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['itemControl'], 'button', true>;
export const CheckboxGroupItemControl = React.forwardRef<React.ElementRef<'button'>, CheckboxGroupItemControlProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="itemControl" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupItemControl.displayName = 'CheckboxGroupItemControl';

export type CheckboxGroupItemIndicatorProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['itemIndicator'], 'span', true>;
export const CheckboxGroupItemIndicator = React.forwardRef<React.ElementRef<'span'>, CheckboxGroupItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupItemIndicator.displayName = 'CheckboxGroupItemIndicator';

export type CheckboxGroupHiddenInputProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['hiddenInput'], 'input', true>;
export const CheckboxGroupHiddenInput = React.forwardRef<React.ElementRef<'input'>, CheckboxGroupHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupHiddenInput.displayName = 'CheckboxGroupHiddenInput';

export type CheckboxGroupErrorProps = ReactPrimitivePartProps<CheckboxGroupController['parts']['error'], 'div', false>;
export const CheckboxGroupError = React.forwardRef<React.ElementRef<'div'>, CheckboxGroupErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={CheckboxGroupDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CheckboxGroupError.displayName = 'CheckboxGroupError';

export const CheckboxGroupProvider = CheckboxGroupRoot;
export function useCheckboxGroup(inputs: CheckboxGroupProps = {} as CheckboxGroupProps): ReactPrimitiveHookResult<CheckboxGroupController['state'], CheckboxGroupController['actions']> {
  return useReactPrimitive(CheckboxGroupDefinition, inputs) as ReactPrimitiveHookResult<CheckboxGroupController['state'], CheckboxGroupController['actions']>;
}
export const CheckboxGroup = Object.assign(CheckboxGroupRoot, { Provider: CheckboxGroupProvider, Root: CheckboxGroupRoot, Label: CheckboxGroupLabel, Item: CheckboxGroupItem, ItemControl: CheckboxGroupItemControl, ItemIndicator: CheckboxGroupItemIndicator, HiddenInput: CheckboxGroupHiddenInput, Error: CheckboxGroupError });
