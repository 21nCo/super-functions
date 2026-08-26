import { createContext, type JSX } from 'solid-js';
import { createPinInputController, type PinInputProps, type PinInputController } from '@uifn/core/primitives/pin-input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const PinInputContext = createContext<SolidPrimitiveContextValue<PinInputProps>>();
export const PinInputDefinition: SolidPrimitiveDefinition<PinInputProps> = {
  name: 'PinInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","length","mask","otp","name","disabled","readOnly","required"],
  context: PinInputContext,
  createController: createPinInputController as never,
};

function PinInputRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PinInputRootProps = SolidPrimitiveRootProps<PinInputProps, 'div'>;
export function PinInputRoot(props: PinInputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={PinInputDefinition} element="div" renderElement={PinInputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function PinInputLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type PinInputLabelProps = SolidPrimitivePartProps<PinInputController['parts']['label'], 'label', false>;
export function PinInputLabel(props: PinInputLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PinInputDefinition as never}
      part="label"
      element="label"
      renderElement={PinInputLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PinInputControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PinInputControlProps = SolidPrimitivePartProps<PinInputController['parts']['control'], 'div', false>;
export function PinInputControl(props: PinInputControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PinInputDefinition as never}
      part="control"
      element="div"
      renderElement={PinInputControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PinInputInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type PinInputInputProps = SolidPrimitivePartProps<PinInputController['parts']['input'], 'input', true>;
export function PinInputInput(props: PinInputInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PinInputDefinition as never}
      part="input"
      element="input"
      renderElement={PinInputInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

function PinInputHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type PinInputHiddenInputProps = SolidPrimitivePartProps<PinInputController['parts']['hiddenInput'], 'input', false>;
export function PinInputHiddenInput(props: PinInputHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PinInputDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={PinInputHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PinInputErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PinInputErrorProps = SolidPrimitivePartProps<PinInputController['parts']['error'], 'div', false>;
export function PinInputError(props: PinInputErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PinInputDefinition as never}
      part="error"
      element="div"
      renderElement={PinInputErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const PinInputProvider = PinInputRoot;
export const PinInput = /* @__PURE__ */ Object.assign(PinInputRoot, { Provider: PinInputProvider, Root: PinInputRoot, Label: PinInputLabel, Control: PinInputControl, Input: PinInputInput, HiddenInput: PinInputHiddenInput, Error: PinInputError });
