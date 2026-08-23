import { createContext, type JSX } from 'solid-js';
import { createSelectController, type SelectProps, type SelectController } from '@uifn/core/primitives/select';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SelectContext = createContext<SolidPrimitiveContextValue<SelectProps>>();
export const SelectDefinition: SolidPrimitiveDefinition<SelectProps> = {
  name: 'Select',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","name","disabled","readOnly","required"],
  context: SelectContext,
  createController: createSelectController as never,
};

function SelectRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectRootProps = SolidPrimitiveRootProps<SelectProps, 'div'>;
export function SelectRoot(props: SelectRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SelectDefinition} element="div" renderElement={SelectRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SelectLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type SelectLabelProps = SolidPrimitivePartProps<SelectController['parts']['label'], 'label', false>;
export function SelectLabel(props: SelectLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="label"
      element="label"
      renderElement={SelectLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectControlProps = SolidPrimitivePartProps<SelectController['parts']['control'], 'div', false>;
export function SelectControl(props: SelectControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="control"
      element="div"
      renderElement={SelectControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SelectTriggerProps = SolidPrimitivePartProps<SelectController['parts']['trigger'], 'button', false>;
export function SelectTrigger(props: SelectTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="trigger"
      element="button"
      renderElement={SelectTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SelectValueTextProps = SolidPrimitivePartProps<SelectController['parts']['valueText'], 'span', false>;
export function SelectValueText(props: SelectValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="valueText"
      element="span"
      renderElement={SelectValueTextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectClearElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SelectClearProps = SolidPrimitivePartProps<SelectController['parts']['clear'], 'button', false>;
export function SelectClear(props: SelectClearProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="clear"
      element="button"
      renderElement={SelectClearElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectPositionerProps = SolidPrimitivePartProps<SelectController['parts']['positioner'], 'div', false>;
export function SelectPositioner(props: SelectPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="positioner"
      element="div"
      renderElement={SelectPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectContentProps = SolidPrimitivePartProps<SelectController['parts']['content'], 'div', false>;
export function SelectContent(props: SelectContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="content"
      element="div"
      renderElement={SelectContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SelectItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectItemProps = SolidPrimitivePartProps<SelectController['parts']['item'], 'div', true>;
export function SelectItem(props: SelectItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="item"
      element="div"
      renderElement={SelectItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SelectItemTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SelectItemTextProps = SolidPrimitivePartProps<SelectController['parts']['itemText'], 'span', true>;
export function SelectItemText(props: SelectItemTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="itemText"
      element="span"
      renderElement={SelectItemTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SelectItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SelectItemIndicatorProps = SolidPrimitivePartProps<SelectController['parts']['itemIndicator'], 'span', true>;
export function SelectItemIndicator(props: SelectItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={SelectItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SelectGroupElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectGroupProps = SolidPrimitivePartProps<SelectController['parts']['group'], 'div', true>;
export function SelectGroup(props: SelectGroupProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="group"
      element="div"
      renderElement={SelectGroupElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SelectGroupLabelElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SelectGroupLabelProps = SolidPrimitivePartProps<SelectController['parts']['groupLabel'], 'div', true>;
export function SelectGroupLabel(props: SelectGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="groupLabel"
      element="div"
      renderElement={SelectGroupLabelElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SelectHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type SelectHiddenInputProps = SolidPrimitivePartProps<SelectController['parts']['hiddenInput'], 'input', true>;
export function SelectHiddenInput(props: SelectHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SelectDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={SelectHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const SelectProvider = SelectRoot;
export const Select = /* @__PURE__ */ Object.assign(SelectRoot, { Provider: SelectProvider, Root: SelectRoot, Label: SelectLabel, Control: SelectControl, Trigger: SelectTrigger, ValueText: SelectValueText, Clear: SelectClear, Positioner: SelectPositioner, Content: SelectContent, Item: SelectItem, ItemText: SelectItemText, ItemIndicator: SelectItemIndicator, Group: SelectGroup, GroupLabel: SelectGroupLabel, HiddenInput: SelectHiddenInput });
