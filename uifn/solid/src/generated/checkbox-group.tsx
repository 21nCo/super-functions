import { createContext, type JSX } from 'solid-js';
import { createCheckboxGroupController, type CheckboxGroupProps, type CheckboxGroupController } from '@uifn/core/primitives/checkbox-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CheckboxGroupContext = createContext<SolidPrimitiveContextValue<CheckboxGroupProps>>();
export const CheckboxGroupDefinition: SolidPrimitiveDefinition<CheckboxGroupProps> = {
  name: 'CheckboxGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  context: CheckboxGroupContext,
  createController: createCheckboxGroupController as never,
};

function CheckboxGroupRootElement(props: JSX.IntrinsicElements['fieldset']): JSX.Element {
  return <fieldset {...props} />;
}

export type CheckboxGroupRootProps = SolidPrimitiveRootProps<CheckboxGroupProps, 'fieldset'>;
export function CheckboxGroupRoot(props: CheckboxGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CheckboxGroupDefinition} element="fieldset" renderElement={CheckboxGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CheckboxGroupLabelElement(props: JSX.IntrinsicElements['legend']): JSX.Element {
  return <legend {...props} />;
}

export type CheckboxGroupLabelProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['label'], 'legend', false>;
export function CheckboxGroupLabel(props: CheckboxGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="label"
      element="legend"
      renderElement={CheckboxGroupLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CheckboxGroupItemElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type CheckboxGroupItemProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['item'], 'label', true>;
export function CheckboxGroupItem(props: CheckboxGroupItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="item"
      element="label"
      renderElement={CheckboxGroupItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CheckboxGroupItemControlElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CheckboxGroupItemControlProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['itemControl'], 'button', true>;
export function CheckboxGroupItemControl(props: CheckboxGroupItemControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="itemControl"
      element="button"
      renderElement={CheckboxGroupItemControlElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CheckboxGroupItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type CheckboxGroupItemIndicatorProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['itemIndicator'], 'span', true>;
export function CheckboxGroupItemIndicator(props: CheckboxGroupItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={CheckboxGroupItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CheckboxGroupHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type CheckboxGroupHiddenInputProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['hiddenInput'], 'input', true>;
export function CheckboxGroupHiddenInput(props: CheckboxGroupHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={CheckboxGroupHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

function CheckboxGroupErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CheckboxGroupErrorProps = SolidPrimitivePartProps<CheckboxGroupController['parts']['error'], 'div', false>;
export function CheckboxGroupError(props: CheckboxGroupErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxGroupDefinition as never}
      part="error"
      element="div"
      renderElement={CheckboxGroupErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CheckboxGroupProvider = CheckboxGroupRoot;
export const CheckboxGroup = /* @__PURE__ */ Object.assign(CheckboxGroupRoot, { Provider: CheckboxGroupProvider, Root: CheckboxGroupRoot, Label: CheckboxGroupLabel, Item: CheckboxGroupItem, ItemControl: CheckboxGroupItemControl, ItemIndicator: CheckboxGroupItemIndicator, HiddenInput: CheckboxGroupHiddenInput, Error: CheckboxGroupError });
