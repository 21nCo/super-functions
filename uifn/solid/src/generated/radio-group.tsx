import { createContext, type JSX } from 'solid-js';
import { createRadioGroupController, type RadioGroupProps, type RadioGroupController } from '@uifn/core/primitives/radio-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const RadioGroupContext = createContext<SolidPrimitiveContextValue<RadioGroupProps>>();
export const RadioGroupDefinition: SolidPrimitiveDefinition<RadioGroupProps> = {
  name: 'RadioGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","loop","disabled","readOnly","required"],
  context: RadioGroupContext,
  createController: createRadioGroupController as never,
};

function RadioGroupRootElement(props: JSX.IntrinsicElements['fieldset']): JSX.Element {
  return <fieldset {...props} />;
}

export type RadioGroupRootProps = SolidPrimitiveRootProps<RadioGroupProps, 'fieldset'>;
export function RadioGroupRoot(props: RadioGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={RadioGroupDefinition} element="fieldset" renderElement={RadioGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function RadioGroupLabelElement(props: JSX.IntrinsicElements['legend']): JSX.Element {
  return <legend {...props} />;
}

export type RadioGroupLabelProps = SolidPrimitivePartProps<RadioGroupController['parts']['label'], 'legend', false>;
export function RadioGroupLabel(props: RadioGroupLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="label"
      element="legend"
      renderElement={RadioGroupLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function RadioGroupItemElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type RadioGroupItemProps = SolidPrimitivePartProps<RadioGroupController['parts']['item'], 'label', true>;
export function RadioGroupItem(props: RadioGroupItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="item"
      element="label"
      renderElement={RadioGroupItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RadioGroupItemControlElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type RadioGroupItemControlProps = SolidPrimitivePartProps<RadioGroupController['parts']['itemControl'], 'button', true>;
export function RadioGroupItemControl(props: RadioGroupItemControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="itemControl"
      element="button"
      renderElement={RadioGroupItemControlElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RadioGroupItemIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type RadioGroupItemIndicatorProps = SolidPrimitivePartProps<RadioGroupController['parts']['itemIndicator'], 'span', true>;
export function RadioGroupItemIndicator(props: RadioGroupItemIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="itemIndicator"
      element="span"
      renderElement={RadioGroupItemIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RadioGroupHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type RadioGroupHiddenInputProps = SolidPrimitivePartProps<RadioGroupController['parts']['hiddenInput'], 'input', true>;
export function RadioGroupHiddenInput(props: RadioGroupHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={RadioGroupHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

function RadioGroupErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type RadioGroupErrorProps = SolidPrimitivePartProps<RadioGroupController['parts']['error'], 'div', false>;
export function RadioGroupError(props: RadioGroupErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={RadioGroupDefinition as never}
      part="error"
      element="div"
      renderElement={RadioGroupErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const RadioGroupProvider = RadioGroupRoot;
export const RadioGroup = /* @__PURE__ */ Object.assign(RadioGroupRoot, { Provider: RadioGroupProvider, Root: RadioGroupRoot, Label: RadioGroupLabel, Item: RadioGroupItem, ItemControl: RadioGroupItemControl, ItemIndicator: RadioGroupItemIndicator, HiddenInput: RadioGroupHiddenInput, Error: RadioGroupError });
