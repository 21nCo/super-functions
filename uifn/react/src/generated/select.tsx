'use client';

import * as React from 'react';
import { createSelectController, type SelectProps, type SelectController } from '@uifn/core/primitives/select';
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

const SelectContext = React.createContext<ReactPrimitiveBridge<SelectProps> | null>(null);
const SelectDefinition: ReactPrimitiveDefinition<SelectProps> = {
  name: 'Select',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","name","disabled","readOnly","required"],
  context: SelectContext,
  createController: createSelectController as never,
};

export type SelectRootProps = ReactPrimitiveRootProps<SelectProps, 'div'>;
export const SelectRoot = React.forwardRef<React.ElementRef<'div'>, SelectRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SelectDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectRoot.displayName = 'SelectRoot';

export type SelectLabelProps = ReactPrimitivePartProps<SelectController['parts']['label'], 'label', false>;
export const SelectLabel = React.forwardRef<React.ElementRef<'label'>, SelectLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectLabel.displayName = 'SelectLabel';

export type SelectControlProps = ReactPrimitivePartProps<SelectController['parts']['control'], 'div', false>;
export const SelectControl = React.forwardRef<React.ElementRef<'div'>, SelectControlProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectControl.displayName = 'SelectControl';

export type SelectTriggerProps = ReactPrimitivePartProps<SelectController['parts']['trigger'], 'button', false>;
export const SelectTrigger = React.forwardRef<React.ElementRef<'button'>, SelectTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectTrigger.displayName = 'SelectTrigger';

export type SelectValueTextProps = ReactPrimitivePartProps<SelectController['parts']['valueText'], 'span', false>;
export const SelectValueText = React.forwardRef<React.ElementRef<'span'>, SelectValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="valueText" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectValueText.displayName = 'SelectValueText';

export type SelectClearProps = ReactPrimitivePartProps<SelectController['parts']['clear'], 'button', false>;
export const SelectClear = React.forwardRef<React.ElementRef<'button'>, SelectClearProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="clear" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectClear.displayName = 'SelectClear';

export type SelectPositionerProps = ReactPrimitivePartProps<SelectController['parts']['positioner'], 'div', false>;
export const SelectPositioner = React.forwardRef<React.ElementRef<'div'>, SelectPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectPositioner.displayName = 'SelectPositioner';

export type SelectContentProps = ReactPrimitivePartProps<SelectController['parts']['content'], 'div', false>;
export const SelectContent = React.forwardRef<React.ElementRef<'div'>, SelectContentProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectContent.displayName = 'SelectContent';

export type SelectItemProps = ReactPrimitivePartProps<SelectController['parts']['item'], 'div', true>;
export const SelectItem = React.forwardRef<React.ElementRef<'div'>, SelectItemProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectItem.displayName = 'SelectItem';

export type SelectItemTextProps = ReactPrimitivePartProps<SelectController['parts']['itemText'], 'span', true>;
export const SelectItemText = React.forwardRef<React.ElementRef<'span'>, SelectItemTextProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="itemText" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectItemText.displayName = 'SelectItemText';

export type SelectItemIndicatorProps = ReactPrimitivePartProps<SelectController['parts']['itemIndicator'], 'span', true>;
export const SelectItemIndicator = React.forwardRef<React.ElementRef<'span'>, SelectItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectItemIndicator.displayName = 'SelectItemIndicator';

export type SelectGroupProps = ReactPrimitivePartProps<SelectController['parts']['group'], 'div', true>;
export const SelectGroup = React.forwardRef<React.ElementRef<'div'>, SelectGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="group" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectGroup.displayName = 'SelectGroup';

export type SelectGroupLabelProps = ReactPrimitivePartProps<SelectController['parts']['groupLabel'], 'div', true>;
export const SelectGroupLabel = React.forwardRef<React.ElementRef<'div'>, SelectGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="groupLabel" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectGroupLabel.displayName = 'SelectGroupLabel';

export type SelectHiddenInputProps = ReactPrimitivePartProps<SelectController['parts']['hiddenInput'], 'input', true>;
export const SelectHiddenInput = React.forwardRef<React.ElementRef<'input'>, SelectHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={SelectDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SelectHiddenInput.displayName = 'SelectHiddenInput';

export const SelectProvider = SelectRoot;
export function useSelect(inputs: SelectProps): ReactPrimitiveHookResult<SelectController['state'], SelectController['actions']> {
  return useReactPrimitive(SelectDefinition, inputs) as ReactPrimitiveHookResult<SelectController['state'], SelectController['actions']>;
}
export const Select = Object.assign(SelectRoot, { Provider: SelectProvider, Root: SelectRoot, Label: SelectLabel, Control: SelectControl, Trigger: SelectTrigger, ValueText: SelectValueText, Clear: SelectClear, Positioner: SelectPositioner, Content: SelectContent, Item: SelectItem, ItemText: SelectItemText, ItemIndicator: SelectItemIndicator, Group: SelectGroup, GroupLabel: SelectGroupLabel, HiddenInput: SelectHiddenInput });
