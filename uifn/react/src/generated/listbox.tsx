'use client';

import * as React from 'react';
import { createListboxController, type ListboxProps, type ListboxController } from '@uifn/core/primitives/listbox';
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

const ListboxContext = React.createContext<ReactPrimitiveBridge<ListboxProps> | null>(null);
const ListboxDefinition: ReactPrimitiveDefinition<ListboxProps> = {
  name: 'Listbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","orientation","name","disabled","readOnly","required"],
  context: ListboxContext,
  createController: createListboxController as never,
};

export type ListboxRootProps = ReactPrimitiveRootProps<ListboxProps, 'div'>;
export const ListboxRoot = React.forwardRef<React.ElementRef<'div'>, ListboxRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ListboxDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxRoot.displayName = 'ListboxRoot';

export type ListboxLabelProps = ReactPrimitivePartProps<ListboxController['parts']['label'], 'label', false>;
export const ListboxLabel = React.forwardRef<React.ElementRef<'label'>, ListboxLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxLabel.displayName = 'ListboxLabel';

export type ListboxContentProps = ReactPrimitivePartProps<ListboxController['parts']['content'], 'div', false>;
export const ListboxContent = React.forwardRef<React.ElementRef<'div'>, ListboxContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxContent.displayName = 'ListboxContent';

export type ListboxItemProps = ReactPrimitivePartProps<ListboxController['parts']['item'], 'div', true>;
export const ListboxItem = React.forwardRef<React.ElementRef<'div'>, ListboxItemProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxItem.displayName = 'ListboxItem';

export type ListboxItemIndicatorProps = ReactPrimitivePartProps<ListboxController['parts']['itemIndicator'], 'span', true>;
export const ListboxItemIndicator = React.forwardRef<React.ElementRef<'span'>, ListboxItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxItemIndicator.displayName = 'ListboxItemIndicator';

export type ListboxGroupProps = ReactPrimitivePartProps<ListboxController['parts']['group'], 'div', true>;
export const ListboxGroup = React.forwardRef<React.ElementRef<'div'>, ListboxGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="group" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxGroup.displayName = 'ListboxGroup';

export type ListboxGroupLabelProps = ReactPrimitivePartProps<ListboxController['parts']['groupLabel'], 'div', true>;
export const ListboxGroupLabel = React.forwardRef<React.ElementRef<'div'>, ListboxGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="groupLabel" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxGroupLabel.displayName = 'ListboxGroupLabel';

export type ListboxHiddenInputProps = ReactPrimitivePartProps<ListboxController['parts']['hiddenInput'], 'input', true>;
export const ListboxHiddenInput = React.forwardRef<React.ElementRef<'input'>, ListboxHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={ListboxDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ListboxHiddenInput.displayName = 'ListboxHiddenInput';

export const ListboxProvider = ListboxRoot;
export function useListbox(inputs: ListboxProps): ReactPrimitiveHookResult<ListboxController['state'], ListboxController['actions']> {
  return useReactPrimitive(ListboxDefinition, inputs) as ReactPrimitiveHookResult<ListboxController['state'], ListboxController['actions']>;
}
export const Listbox = Object.assign(ListboxRoot, { Provider: ListboxProvider, Root: ListboxRoot, Label: ListboxLabel, Content: ListboxContent, Item: ListboxItem, ItemIndicator: ListboxItemIndicator, Group: ListboxGroup, GroupLabel: ListboxGroupLabel, HiddenInput: ListboxHiddenInput });
