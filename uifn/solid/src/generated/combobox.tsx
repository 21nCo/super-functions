import { createContext, type JSX } from 'solid-js';
import { createComboboxController, type ComboboxProps, type ComboboxController } from '@uifn/core/primitives/combobox';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ComboboxContext = createContext<SolidPrimitiveContextValue<ComboboxProps>>();
export const ComboboxDefinition: SolidPrimitiveDefinition<ComboboxProps> = {
  name: 'Combobox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","inputValue","items","multiple","name","disabled","readOnly","required"],
  context: ComboboxContext,
  createController: createComboboxController as never,
};

function ComboboxRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxRootProps = SolidPrimitiveRootProps<ComboboxProps, 'div'>;
export function ComboboxRoot(props: ComboboxRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ComboboxDefinition} element="div" renderElement={ComboboxRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ComboboxLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type ComboboxLabelProps = SolidPrimitivePartProps<ComboboxController['parts']['label'], 'label', false>;
export function ComboboxLabel(props: ComboboxLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="label"
      element="label"
      renderElement={ComboboxLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxControlProps = SolidPrimitivePartProps<ComboboxController['parts']['control'], 'div', false>;
export function ComboboxControl(props: ComboboxControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="control"
      element="div"
      renderElement={ComboboxControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ComboboxInputProps = SolidPrimitivePartProps<ComboboxController['parts']['input'], 'input', false>;
export function ComboboxInput(props: ComboboxInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="input"
      element="input"
      renderElement={ComboboxInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ComboboxTriggerProps = SolidPrimitivePartProps<ComboboxController['parts']['trigger'], 'button', false>;
export function ComboboxTrigger(props: ComboboxTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="trigger"
      element="button"
      renderElement={ComboboxTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxClearElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ComboboxClearProps = SolidPrimitivePartProps<ComboboxController['parts']['clear'], 'button', false>;
export function ComboboxClear(props: ComboboxClearProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="clear"
      element="button"
      renderElement={ComboboxClearElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxPositionerProps = SolidPrimitivePartProps<ComboboxController['parts']['positioner'], 'div', false>;
export function ComboboxPositioner(props: ComboboxPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="positioner"
      element="div"
      renderElement={ComboboxPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxContentProps = SolidPrimitivePartProps<ComboboxController['parts']['content'], 'div', false>;
export function ComboboxContent(props: ComboboxContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="content"
      element="div"
      renderElement={ComboboxContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxItemProps = SolidPrimitivePartProps<ComboboxController['parts']['item'], 'div', true>;
export function ComboboxItem(props: ComboboxItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="item"
      element="div"
      renderElement={ComboboxItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ComboboxItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ComboboxItemIndicatorProps = SolidPrimitivePartProps<ComboboxController['parts']['itemIndicator'], 'span', true>;
export function ComboboxItemIndicator(props: ComboboxItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={ComboboxItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ComboboxEmptyElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ComboboxEmptyProps = SolidPrimitivePartProps<ComboboxController['parts']['empty'], 'div', false>;
export function ComboboxEmpty(props: ComboboxEmptyProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="empty"
      element="div"
      renderElement={ComboboxEmptyElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ComboboxHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ComboboxHiddenInputProps = SolidPrimitivePartProps<ComboboxController['parts']['hiddenInput'], 'input', false>;
export function ComboboxHiddenInput(props: ComboboxHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ComboboxDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={ComboboxHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ComboboxProvider = ComboboxRoot;
export const Combobox = /* @__PURE__ */ Object.assign(ComboboxRoot, { Provider: ComboboxProvider, Root: ComboboxRoot, Label: ComboboxLabel, Control: ComboboxControl, Input: ComboboxInput, Trigger: ComboboxTrigger, Clear: ComboboxClear, Positioner: ComboboxPositioner, Content: ComboboxContent, Item: ComboboxItem, ItemIndicator: ComboboxItemIndicator, Empty: ComboboxEmpty, HiddenInput: ComboboxHiddenInput });
