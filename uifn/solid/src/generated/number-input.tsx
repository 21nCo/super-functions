import { createContext, type JSX } from 'solid-js';
import { createNumberInputController, type NumberInputProps, type NumberInputController } from '@uifn/core/primitives/number-input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const NumberInputContext = createContext<SolidPrimitiveContextValue<NumberInputProps>>();
export const NumberInputDefinition: SolidPrimitiveDefinition<NumberInputProps> = {
  name: 'NumberInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","locale","name","disabled","readOnly","required"],
  context: NumberInputContext,
  createController: createNumberInputController as never,
};

function NumberInputRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NumberInputRootProps = SolidPrimitiveRootProps<NumberInputProps, 'div'>;
export function NumberInputRoot(props: NumberInputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={NumberInputDefinition} element="div" renderElement={NumberInputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function NumberInputLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type NumberInputLabelProps = SolidPrimitivePartProps<NumberInputController['parts']['label'], 'label', false>;
export function NumberInputLabel(props: NumberInputLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="label"
      element="label"
      renderElement={NumberInputLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NumberInputControlProps = SolidPrimitivePartProps<NumberInputController['parts']['control'], 'div', false>;
export function NumberInputControl(props: NumberInputControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="control"
      element="div"
      renderElement={NumberInputControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type NumberInputInputProps = SolidPrimitivePartProps<NumberInputController['parts']['input'], 'input', false>;
export function NumberInputInput(props: NumberInputInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="input"
      element="input"
      renderElement={NumberInputInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputIncrementElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type NumberInputIncrementProps = SolidPrimitivePartProps<NumberInputController['parts']['increment'], 'button', false>;
export function NumberInputIncrement(props: NumberInputIncrementProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="increment"
      element="button"
      renderElement={NumberInputIncrementElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputDecrementElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type NumberInputDecrementProps = SolidPrimitivePartProps<NumberInputController['parts']['decrement'], 'button', false>;
export function NumberInputDecrement(props: NumberInputDecrementProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="decrement"
      element="button"
      renderElement={NumberInputDecrementElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputScrubberElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NumberInputScrubberProps = SolidPrimitivePartProps<NumberInputController['parts']['scrubber'], 'div', false>;
export function NumberInputScrubber(props: NumberInputScrubberProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="scrubber"
      element="div"
      renderElement={NumberInputScrubberElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type NumberInputHiddenInputProps = SolidPrimitivePartProps<NumberInputController['parts']['hiddenInput'], 'input', false>;
export function NumberInputHiddenInput(props: NumberInputHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={NumberInputHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NumberInputErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NumberInputErrorProps = SolidPrimitivePartProps<NumberInputController['parts']['error'], 'div', false>;
export function NumberInputError(props: NumberInputErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NumberInputDefinition as never}
      part="error"
      element="div"
      renderElement={NumberInputErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const NumberInputProvider = NumberInputRoot;
export const NumberInput = /* @__PURE__ */ Object.assign(NumberInputRoot, { Provider: NumberInputProvider, Root: NumberInputRoot, Label: NumberInputLabel, Control: NumberInputControl, Input: NumberInputInput, Increment: NumberInputIncrement, Decrement: NumberInputDecrement, Scrubber: NumberInputScrubber, HiddenInput: NumberInputHiddenInput, Error: NumberInputError });
