'use client';

import * as React from 'react';
import { createEditableController, type EditableProps, type EditableController } from '@uifn/core/primitives/editable';
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

const EditableContext = React.createContext<ReactPrimitiveBridge<EditableProps> | null>(null);
const EditableDefinition: ReactPrimitiveDefinition<EditableProps> = {
  name: 'Editable',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","editing","defaultEditing","name","disabled","readOnly","required"],
  context: EditableContext,
  createController: createEditableController as never,
};

export type EditableRootProps = ReactPrimitiveRootProps<EditableProps, 'div'>;
export const EditableRoot = React.forwardRef<React.ElementRef<'div'>, EditableRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={EditableDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableRoot.displayName = 'EditableRoot';

export type EditableLabelProps = ReactPrimitivePartProps<EditableController['parts']['label'], 'label', false>;
export const EditableLabel = React.forwardRef<React.ElementRef<'label'>, EditableLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableLabel.displayName = 'EditableLabel';

export type EditablePreviewProps = ReactPrimitivePartProps<EditableController['parts']['preview'], 'button', false>;
export const EditablePreview = React.forwardRef<React.ElementRef<'button'>, EditablePreviewProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="preview" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditablePreview.displayName = 'EditablePreview';

export type EditableInputProps = ReactPrimitivePartProps<EditableController['parts']['input'], 'input', false>;
export const EditableInput = React.forwardRef<React.ElementRef<'input'>, EditableInputProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="input" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableInput.displayName = 'EditableInput';

export type EditableControlProps = ReactPrimitivePartProps<EditableController['parts']['control'], 'div', false>;
export const EditableControl = React.forwardRef<React.ElementRef<'div'>, EditableControlProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableControl.displayName = 'EditableControl';

export type EditableSubmitProps = ReactPrimitivePartProps<EditableController['parts']['submit'], 'button', false>;
export const EditableSubmit = React.forwardRef<React.ElementRef<'button'>, EditableSubmitProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="submit" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableSubmit.displayName = 'EditableSubmit';

export type EditableCancelProps = ReactPrimitivePartProps<EditableController['parts']['cancel'], 'button', false>;
export const EditableCancel = React.forwardRef<React.ElementRef<'button'>, EditableCancelProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="cancel" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableCancel.displayName = 'EditableCancel';

export type EditableErrorProps = ReactPrimitivePartProps<EditableController['parts']['error'], 'div', false>;
export const EditableError = React.forwardRef<React.ElementRef<'div'>, EditableErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableError.displayName = 'EditableError';

export type EditableHiddenInputProps = ReactPrimitivePartProps<EditableController['parts']['hiddenInput'], 'input', false>;
export const EditableHiddenInput = React.forwardRef<React.ElementRef<'input'>, EditableHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={EditableDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
EditableHiddenInput.displayName = 'EditableHiddenInput';

export const EditableProvider = EditableRoot;
export function useEditable(inputs: EditableProps = {} as EditableProps): ReactPrimitiveHookResult<EditableController['state'], EditableController['actions']> {
  return useReactPrimitive(EditableDefinition, inputs) as ReactPrimitiveHookResult<EditableController['state'], EditableController['actions']>;
}
export const Editable = Object.assign(EditableRoot, { Provider: EditableProvider, Root: EditableRoot, Label: EditableLabel, Preview: EditablePreview, Input: EditableInput, Control: EditableControl, Submit: EditableSubmit, Cancel: EditableCancel, Error: EditableError, HiddenInput: EditableHiddenInput });
