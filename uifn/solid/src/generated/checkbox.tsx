import { createContext, type JSX } from 'solid-js';
import { createCheckboxController, type CheckboxProps, type CheckboxController } from '@uifn/core/primitives/checkbox';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CheckboxContext = createContext<SolidPrimitiveContextValue<CheckboxProps>>();
export const CheckboxDefinition: SolidPrimitiveDefinition<CheckboxProps> = {
  name: 'Checkbox',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  context: CheckboxContext,
  createController: createCheckboxController as never,
};

function CheckboxRootElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type CheckboxRootProps = SolidPrimitiveRootProps<CheckboxProps, 'label'>;
export function CheckboxRoot(props: CheckboxRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CheckboxDefinition} element="label" renderElement={CheckboxRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CheckboxControlElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CheckboxControlProps = SolidPrimitivePartProps<CheckboxController['parts']['control'], 'button', false>;
export function CheckboxControl(props: CheckboxControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxDefinition as never}
      part="control"
      element="button"
      renderElement={CheckboxControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CheckboxIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type CheckboxIndicatorProps = SolidPrimitivePartProps<CheckboxController['parts']['indicator'], 'span', false>;
export function CheckboxIndicator(props: CheckboxIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxDefinition as never}
      part="indicator"
      element="span"
      renderElement={CheckboxIndicatorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CheckboxLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type CheckboxLabelProps = SolidPrimitivePartProps<CheckboxController['parts']['label'], 'span', false>;
export function CheckboxLabel(props: CheckboxLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxDefinition as never}
      part="label"
      element="span"
      renderElement={CheckboxLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CheckboxHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type CheckboxHiddenInputProps = SolidPrimitivePartProps<CheckboxController['parts']['hiddenInput'], 'input', false>;
export function CheckboxHiddenInput(props: CheckboxHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CheckboxDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={CheckboxHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CheckboxProvider = CheckboxRoot;
export const Checkbox = /* @__PURE__ */ Object.assign(CheckboxRoot, { Provider: CheckboxProvider, Root: CheckboxRoot, Control: CheckboxControl, Indicator: CheckboxIndicator, Label: CheckboxLabel, HiddenInput: CheckboxHiddenInput });
