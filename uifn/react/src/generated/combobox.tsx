'use client';

import * as React from 'react';
import { createComboboxController, type ComboboxProps, type ComboboxController } from '@uifn/core/primitives/combobox';
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

const ComboboxContext = React.createContext<ReactPrimitiveBridge<ComboboxProps> | null>(null);
const ComboboxDefinition: ReactPrimitiveDefinition<ComboboxProps> = {
  name: 'Combobox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","items","multiple","name","disabled","readOnly","required"],
  context: ComboboxContext,
  createController: createComboboxController as never,
};

export type ComboboxRootProps = ReactPrimitiveRootProps<ComboboxProps, 'div'>;
export const ComboboxRoot = React.forwardRef<React.ElementRef<'div'>, ComboboxRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ComboboxDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxRoot.displayName = 'ComboboxRoot';

export type ComboboxLabelProps = ReactPrimitivePartProps<ComboboxController['parts']['label'], 'label', false>;
export const ComboboxLabel = React.forwardRef<React.ElementRef<'label'>, ComboboxLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxLabel.displayName = 'ComboboxLabel';

export type ComboboxControlProps = ReactPrimitivePartProps<ComboboxController['parts']['control'], 'div', false>;
export const ComboboxControl = React.forwardRef<React.ElementRef<'div'>, ComboboxControlProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxControl.displayName = 'ComboboxControl';

export type ComboboxInputProps = ReactPrimitivePartProps<ComboboxController['parts']['input'], 'input', false>;
export const ComboboxInput = React.forwardRef<React.ElementRef<'input'>, ComboboxInputProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxInput.displayName = 'ComboboxInput';

export type ComboboxTriggerProps = ReactPrimitivePartProps<ComboboxController['parts']['trigger'], 'button', false>;
export const ComboboxTrigger = React.forwardRef<React.ElementRef<'button'>, ComboboxTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxTrigger.displayName = 'ComboboxTrigger';

export type ComboboxClearProps = ReactPrimitivePartProps<ComboboxController['parts']['clear'], 'button', false>;
export const ComboboxClear = React.forwardRef<React.ElementRef<'button'>, ComboboxClearProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="clear" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxClear.displayName = 'ComboboxClear';

export type ComboboxPositionerProps = ReactPrimitivePartProps<ComboboxController['parts']['positioner'], 'div', false>;
export const ComboboxPositioner = React.forwardRef<React.ElementRef<'div'>, ComboboxPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxPositioner.displayName = 'ComboboxPositioner';

export type ComboboxContentProps = ReactPrimitivePartProps<ComboboxController['parts']['content'], 'div', false>;
export const ComboboxContent = React.forwardRef<React.ElementRef<'div'>, ComboboxContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxContent.displayName = 'ComboboxContent';

export type ComboboxItemProps = ReactPrimitivePartProps<ComboboxController['parts']['item'], 'div', true>;
export const ComboboxItem = React.forwardRef<React.ElementRef<'div'>, ComboboxItemProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxItem.displayName = 'ComboboxItem';

export type ComboboxItemIndicatorProps = ReactPrimitivePartProps<ComboboxController['parts']['itemIndicator'], 'span', true>;
export const ComboboxItemIndicator = React.forwardRef<React.ElementRef<'span'>, ComboboxItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxItemIndicator.displayName = 'ComboboxItemIndicator';

export type ComboboxEmptyProps = ReactPrimitivePartProps<ComboboxController['parts']['empty'], 'div', false>;
export const ComboboxEmpty = React.forwardRef<React.ElementRef<'div'>, ComboboxEmptyProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="empty" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxEmpty.displayName = 'ComboboxEmpty';

export type ComboboxHiddenInputProps = ReactPrimitivePartProps<ComboboxController['parts']['hiddenInput'], 'input', false>;
export const ComboboxHiddenInput = React.forwardRef<React.ElementRef<'input'>, ComboboxHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={ComboboxDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ComboboxHiddenInput.displayName = 'ComboboxHiddenInput';

export const ComboboxProvider = ComboboxRoot;
export function useCombobox(inputs: ComboboxProps): ReactPrimitiveHookResult<ComboboxController['state'], ComboboxController['actions']> {
  return useReactPrimitive(ComboboxDefinition, inputs) as ReactPrimitiveHookResult<ComboboxController['state'], ComboboxController['actions']>;
}
export const Combobox = Object.assign(ComboboxRoot, { Provider: ComboboxProvider, Root: ComboboxRoot, Label: ComboboxLabel, Control: ComboboxControl, Input: ComboboxInput, Trigger: ComboboxTrigger, Clear: ComboboxClear, Positioner: ComboboxPositioner, Content: ComboboxContent, Item: ComboboxItem, ItemIndicator: ComboboxItemIndicator, Empty: ComboboxEmpty, HiddenInput: ComboboxHiddenInput });
