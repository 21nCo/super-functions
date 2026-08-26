import { createContext, type JSX } from 'solid-js';
import { createListboxController, type ListboxProps, type ListboxController } from '@uifn/core/primitives/listbox';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ListboxContext = createContext<SolidPrimitiveContextValue<ListboxProps>>();
export const ListboxDefinition: SolidPrimitiveDefinition<ListboxProps> = {
  name: 'Listbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","orientation","name","disabled","readOnly","required"],
  context: ListboxContext,
  createController: createListboxController as never,
};

function ListboxRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ListboxRootProps = SolidPrimitiveRootProps<ListboxProps, 'div'>;
export function ListboxRoot(props: ListboxRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ListboxDefinition} element="div" renderElement={ListboxRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ListboxLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type ListboxLabelProps = SolidPrimitivePartProps<ListboxController['parts']['label'], 'label', false>;
export function ListboxLabel(props: ListboxLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="label"
      element="label"
      renderElement={ListboxLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ListboxContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ListboxContentProps = SolidPrimitivePartProps<ListboxController['parts']['content'], 'div', false>;
export function ListboxContent(props: ListboxContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="content"
      element="div"
      renderElement={ListboxContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ListboxItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ListboxItemProps = SolidPrimitivePartProps<ListboxController['parts']['item'], 'div', true>;
export function ListboxItem(props: ListboxItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="item"
      element="div"
      renderElement={ListboxItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ListboxItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ListboxItemIndicatorProps = SolidPrimitivePartProps<ListboxController['parts']['itemIndicator'], 'span', true>;
export function ListboxItemIndicator(props: ListboxItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={ListboxItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ListboxGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ListboxGroupProps = SolidPrimitivePartProps<ListboxController['parts']['group'], 'div', true>;
export function ListboxGroup(props: ListboxGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="group"
      element="div"
      renderElement={ListboxGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ListboxGroupLabelElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ListboxGroupLabelProps = SolidPrimitivePartProps<ListboxController['parts']['groupLabel'], 'div', true>;
export function ListboxGroupLabel(props: ListboxGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="groupLabel"
      element="div"
      renderElement={ListboxGroupLabelElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ListboxHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ListboxHiddenInputProps = SolidPrimitivePartProps<ListboxController['parts']['hiddenInput'], 'input', true>;
export function ListboxHiddenInput(props: ListboxHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ListboxDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={ListboxHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const ListboxProvider = ListboxRoot;
export const Listbox = /* @__PURE__ */ Object.assign(ListboxRoot, { Provider: ListboxProvider, Root: ListboxRoot, Label: ListboxLabel, Content: ListboxContent, Item: ListboxItem, ItemIndicator: ListboxItemIndicator, Group: ListboxGroup, GroupLabel: ListboxGroupLabel, HiddenInput: ListboxHiddenInput });
