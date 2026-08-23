import { createContext, type JSX } from 'solid-js';
import { createEditableController, type EditableProps, type EditableController } from '@uifn/core/primitives/editable';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const EditableContext = createContext<SolidPrimitiveContextValue<EditableProps>>();
export const EditableDefinition: SolidPrimitiveDefinition<EditableProps> = {
  name: 'Editable',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","editing","defaultEditing","name","disabled","readOnly","required"],
  context: EditableContext,
  createController: createEditableController as never,
};

function EditableRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type EditableRootProps = SolidPrimitiveRootProps<EditableProps, 'div'>;
export function EditableRoot(props: EditableRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={EditableDefinition} element="div" renderElement={EditableRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function EditableLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type EditableLabelProps = SolidPrimitivePartProps<EditableController['parts']['label'], 'label', false>;
export function EditableLabel(props: EditableLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="label"
      element="label"
      renderElement={EditableLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditablePreviewElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type EditablePreviewProps = SolidPrimitivePartProps<EditableController['parts']['preview'], 'button', false>;
export function EditablePreview(props: EditablePreviewProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="preview"
      element="button"
      renderElement={EditablePreviewElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type EditableInputProps = SolidPrimitivePartProps<EditableController['parts']['input'], 'input', false>;
export function EditableInput(props: EditableInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="input"
      element="input"
      renderElement={EditableInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type EditableControlProps = SolidPrimitivePartProps<EditableController['parts']['control'], 'div', false>;
export function EditableControl(props: EditableControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="control"
      element="div"
      renderElement={EditableControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableSubmitElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type EditableSubmitProps = SolidPrimitivePartProps<EditableController['parts']['submit'], 'button', false>;
export function EditableSubmit(props: EditableSubmitProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="submit"
      element="button"
      renderElement={EditableSubmitElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableCancelElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type EditableCancelProps = SolidPrimitivePartProps<EditableController['parts']['cancel'], 'button', false>;
export function EditableCancel(props: EditableCancelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="cancel"
      element="button"
      renderElement={EditableCancelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type EditableErrorProps = SolidPrimitivePartProps<EditableController['parts']['error'], 'div', false>;
export function EditableError(props: EditableErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="error"
      element="div"
      renderElement={EditableErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function EditableHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type EditableHiddenInputProps = SolidPrimitivePartProps<EditableController['parts']['hiddenInput'], 'input', false>;
export function EditableHiddenInput(props: EditableHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={EditableDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={EditableHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const EditableProvider = EditableRoot;
export const Editable = /* @__PURE__ */ Object.assign(EditableRoot, { Provider: EditableProvider, Root: EditableRoot, Label: EditableLabel, Preview: EditablePreview, Input: EditableInput, Control: EditableControl, Submit: EditableSubmit, Cancel: EditableCancel, Error: EditableError, HiddenInput: EditableHiddenInput });
