'use client';

import * as React from 'react';
import { createTagsInputController, type TagsInputProps, type TagsInputController } from '@uifn/core/primitives/tags-input';
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

const TagsInputContext = React.createContext<ReactPrimitiveBridge<TagsInputProps> | null>(null);
const TagsInputDefinition: ReactPrimitiveDefinition<TagsInputProps> = {
  name: 'TagsInput',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","allowDuplicates","max","delimiter","name","disabled","readOnly","required"],
  context: TagsInputContext,
  createController: createTagsInputController as never,
};

export type TagsInputRootProps = ReactPrimitiveRootProps<TagsInputProps, 'div'>;
export const TagsInputRoot = React.forwardRef<React.ElementRef<'div'>, TagsInputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TagsInputDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputRoot.displayName = 'TagsInputRoot';

export type TagsInputLabelProps = ReactPrimitivePartProps<TagsInputController['parts']['label'], 'label', false>;
export const TagsInputLabel = React.forwardRef<React.ElementRef<'label'>, TagsInputLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputLabel.displayName = 'TagsInputLabel';

export type TagsInputControlProps = ReactPrimitivePartProps<TagsInputController['parts']['control'], 'div', false>;
export const TagsInputControl = React.forwardRef<React.ElementRef<'div'>, TagsInputControlProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputControl.displayName = 'TagsInputControl';

export type TagsInputItemProps = ReactPrimitivePartProps<TagsInputController['parts']['item'], 'span', true>;
export const TagsInputItem = React.forwardRef<React.ElementRef<'span'>, TagsInputItemProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="item" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputItem.displayName = 'TagsInputItem';

export type TagsInputItemTextProps = ReactPrimitivePartProps<TagsInputController['parts']['itemText'], 'span', true>;
export const TagsInputItemText = React.forwardRef<React.ElementRef<'span'>, TagsInputItemTextProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="itemText" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputItemText.displayName = 'TagsInputItemText';

export type TagsInputItemDeleteProps = ReactPrimitivePartProps<TagsInputController['parts']['itemDelete'], 'button', true>;
export const TagsInputItemDelete = React.forwardRef<React.ElementRef<'button'>, TagsInputItemDeleteProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="itemDelete" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputItemDelete.displayName = 'TagsInputItemDelete';

export type TagsInputInputProps = ReactPrimitivePartProps<TagsInputController['parts']['input'], 'input', false>;
export const TagsInputInput = React.forwardRef<React.ElementRef<'input'>, TagsInputInputProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputInput.displayName = 'TagsInputInput';

export type TagsInputClearProps = ReactPrimitivePartProps<TagsInputController['parts']['clear'], 'button', false>;
export const TagsInputClear = React.forwardRef<React.ElementRef<'button'>, TagsInputClearProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="clear" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputClear.displayName = 'TagsInputClear';

export type TagsInputHiddenInputProps = ReactPrimitivePartProps<TagsInputController['parts']['hiddenInput'], 'input', true>;
export const TagsInputHiddenInput = React.forwardRef<React.ElementRef<'input'>, TagsInputHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="hiddenInput" element="input" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputHiddenInput.displayName = 'TagsInputHiddenInput';

export type TagsInputErrorProps = ReactPrimitivePartProps<TagsInputController['parts']['error'], 'div', false>;
export const TagsInputError = React.forwardRef<React.ElementRef<'div'>, TagsInputErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={TagsInputDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TagsInputError.displayName = 'TagsInputError';

export const TagsInputProvider = TagsInputRoot;
export function useTagsInput(inputs: TagsInputProps = {} as TagsInputProps): ReactPrimitiveHookResult<TagsInputController['state'], TagsInputController['actions']> {
  return useReactPrimitive(TagsInputDefinition, inputs) as ReactPrimitiveHookResult<TagsInputController['state'], TagsInputController['actions']>;
}
export const TagsInput = Object.assign(TagsInputRoot, { Provider: TagsInputProvider, Root: TagsInputRoot, Label: TagsInputLabel, Control: TagsInputControl, Item: TagsInputItem, ItemText: TagsInputItemText, ItemDelete: TagsInputItemDelete, Input: TagsInputInput, Clear: TagsInputClear, HiddenInput: TagsInputHiddenInput, Error: TagsInputError });
