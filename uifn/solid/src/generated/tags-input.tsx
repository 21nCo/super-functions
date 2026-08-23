import { createContext, type JSX } from 'solid-js';
import { createTagsInputController, type TagsInputProps, type TagsInputController } from '@uifn/core/primitives/tags-input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TagsInputContext = createContext<SolidPrimitiveContextValue<TagsInputProps>>();
export const TagsInputDefinition: SolidPrimitiveDefinition<TagsInputProps> = {
  name: 'TagsInput',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","allowDuplicates","max","delimiter","name","disabled","readOnly","required"],
  context: TagsInputContext,
  createController: createTagsInputController as never,
};

function TagsInputRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TagsInputRootProps = SolidPrimitiveRootProps<TagsInputProps, 'div'>;
export function TagsInputRoot(props: TagsInputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TagsInputDefinition} element="div" renderElement={TagsInputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TagsInputLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type TagsInputLabelProps = SolidPrimitivePartProps<TagsInputController['parts']['label'], 'label', false>;
export function TagsInputLabel(props: TagsInputLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="label"
      element="label"
      renderElement={TagsInputLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TagsInputControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TagsInputControlProps = SolidPrimitivePartProps<TagsInputController['parts']['control'], 'div', false>;
export function TagsInputControl(props: TagsInputControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="control"
      element="div"
      renderElement={TagsInputControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TagsInputItemElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TagsInputItemProps = SolidPrimitivePartProps<TagsInputController['parts']['item'], 'span', true>;
export function TagsInputItem(props: TagsInputItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="item"
      element="span"
      renderElement={TagsInputItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TagsInputItemTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TagsInputItemTextProps = SolidPrimitivePartProps<TagsInputController['parts']['itemText'], 'span', true>;
export function TagsInputItemText(props: TagsInputItemTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="itemText"
      element="span"
      renderElement={TagsInputItemTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TagsInputItemDeleteElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TagsInputItemDeleteProps = SolidPrimitivePartProps<TagsInputController['parts']['itemDelete'], 'button', true>;
export function TagsInputItemDelete(props: TagsInputItemDeleteProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="itemDelete"
      element="button"
      renderElement={TagsInputItemDeleteElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TagsInputInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type TagsInputInputProps = SolidPrimitivePartProps<TagsInputController['parts']['input'], 'input', false>;
export function TagsInputInput(props: TagsInputInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="input"
      element="input"
      renderElement={TagsInputInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TagsInputClearElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TagsInputClearProps = SolidPrimitivePartProps<TagsInputController['parts']['clear'], 'button', false>;
export function TagsInputClear(props: TagsInputClearProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="clear"
      element="button"
      renderElement={TagsInputClearElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TagsInputHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type TagsInputHiddenInputProps = SolidPrimitivePartProps<TagsInputController['parts']['hiddenInput'], 'input', true>;
export function TagsInputHiddenInput(props: TagsInputHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={TagsInputHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TagsInputErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TagsInputErrorProps = SolidPrimitivePartProps<TagsInputController['parts']['error'], 'div', false>;
export function TagsInputError(props: TagsInputErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TagsInputDefinition as never}
      part="error"
      element="div"
      renderElement={TagsInputErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TagsInputProvider = TagsInputRoot;
export const TagsInput = /* @__PURE__ */ Object.assign(TagsInputRoot, { Provider: TagsInputProvider, Root: TagsInputRoot, Label: TagsInputLabel, Control: TagsInputControl, Item: TagsInputItem, ItemText: TagsInputItemText, ItemDelete: TagsInputItemDelete, Input: TagsInputInput, Clear: TagsInputClear, HiddenInput: TagsInputHiddenInput, Error: TagsInputError });
