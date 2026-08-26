import { createContext, type JSX } from 'solid-js';
import { FieldContract, type FieldProps, type FieldContractParts } from '@uifn/core/primitives/field';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const FieldContext = createContext<SolidPrimitiveContextValue<FieldProps>>();
export const FieldDefinition: SolidPrimitiveDefinition<FieldProps> = {
  name: 'Field',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["name","disabled","readOnly","required","invalid"],
  context: FieldContext,
  contract: FieldContract as never,
};

function FieldRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldRootProps = SolidPrimitiveRootProps<FieldProps, 'div'>;
export function FieldRoot(props: FieldRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={FieldDefinition} element="div" renderElement={FieldRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function FieldLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type FieldLabelProps = SolidPrimitivePartProps<FieldContractParts['label'], 'label', false>;
export function FieldLabel(props: FieldLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldDefinition as never}
      part="label"
      element="label"
      renderElement={FieldLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldControlProps = SolidPrimitivePartProps<FieldContractParts['control'], 'div', false>;
export function FieldControl(props: FieldControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldDefinition as never}
      part="control"
      element="div"
      renderElement={FieldControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldDescriptionElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldDescriptionProps = SolidPrimitivePartProps<FieldContractParts['description'], 'div', false>;
export function FieldDescription(props: FieldDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldDefinition as never}
      part="description"
      element="div"
      renderElement={FieldDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldErrorProps = SolidPrimitivePartProps<FieldContractParts['error'], 'div', false>;
export function FieldError(props: FieldErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldDefinition as never}
      part="error"
      element="div"
      renderElement={FieldErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldRequiredIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type FieldRequiredIndicatorProps = SolidPrimitivePartProps<FieldContractParts['requiredIndicator'], 'span', false>;
export function FieldRequiredIndicator(props: FieldRequiredIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldDefinition as never}
      part="requiredIndicator"
      element="span"
      renderElement={FieldRequiredIndicatorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const FieldProvider = FieldRoot;
export const Field = /* @__PURE__ */ Object.assign(FieldRoot, { Provider: FieldProvider, Root: FieldRoot, Label: FieldLabel, Control: FieldControl, Description: FieldDescription, Error: FieldError, RequiredIndicator: FieldRequiredIndicator });
