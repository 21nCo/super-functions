import { createContext, type JSX } from 'solid-js';
import { createPasswordInputController, type PasswordInputProps, type PasswordInputController } from '@uifn/core/primitives/password-input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const PasswordInputContext = createContext<SolidPrimitiveContextValue<PasswordInputProps>>();
export const PasswordInputDefinition: SolidPrimitiveDefinition<PasswordInputProps> = {
  name: 'PasswordInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","visible","name","autocomplete","disabled","readOnly","required"],
  context: PasswordInputContext,
  createController: createPasswordInputController as never,
};

function PasswordInputRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PasswordInputRootProps = SolidPrimitiveRootProps<PasswordInputProps, 'div'>;
export function PasswordInputRoot(props: PasswordInputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={PasswordInputDefinition} element="div" renderElement={PasswordInputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function PasswordInputLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type PasswordInputLabelProps = SolidPrimitivePartProps<PasswordInputController['parts']['label'], 'label', false>;
export function PasswordInputLabel(props: PasswordInputLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PasswordInputDefinition as never}
      part="label"
      element="label"
      renderElement={PasswordInputLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PasswordInputInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type PasswordInputInputProps = SolidPrimitivePartProps<PasswordInputController['parts']['input'], 'input', false>;
export function PasswordInputInput(props: PasswordInputInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PasswordInputDefinition as never}
      part="input"
      element="input"
      renderElement={PasswordInputInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PasswordInputVisibilityTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PasswordInputVisibilityTriggerProps = SolidPrimitivePartProps<PasswordInputController['parts']['visibilityTrigger'], 'button', false>;
export function PasswordInputVisibilityTrigger(props: PasswordInputVisibilityTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PasswordInputDefinition as never}
      part="visibilityTrigger"
      element="button"
      renderElement={PasswordInputVisibilityTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PasswordInputStrengthElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PasswordInputStrengthProps = SolidPrimitivePartProps<PasswordInputController['parts']['strength'], 'div', false>;
export function PasswordInputStrength(props: PasswordInputStrengthProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PasswordInputDefinition as never}
      part="strength"
      element="div"
      renderElement={PasswordInputStrengthElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PasswordInputErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PasswordInputErrorProps = SolidPrimitivePartProps<PasswordInputController['parts']['error'], 'div', false>;
export function PasswordInputError(props: PasswordInputErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PasswordInputDefinition as never}
      part="error"
      element="div"
      renderElement={PasswordInputErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const PasswordInputProvider = PasswordInputRoot;
export const PasswordInput = /* @__PURE__ */ Object.assign(PasswordInputRoot, { Provider: PasswordInputProvider, Root: PasswordInputRoot, Label: PasswordInputLabel, Input: PasswordInputInput, VisibilityTrigger: PasswordInputVisibilityTrigger, Strength: PasswordInputStrength, Error: PasswordInputError });
