import { createContext, type JSX } from 'solid-js';
import { createDateInputController, type DateInputProps, type DateInputController } from '@uifn/core/primitives/date-input';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const DateInputContext = createContext<SolidPrimitiveContextValue<DateInputProps>>();
export const DateInputDefinition: SolidPrimitiveDefinition<DateInputProps> = {
  name: 'DateInput',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","locale","timeZone","min","max","name","disabled","readOnly"],
  context: DateInputContext,
  createController: createDateInputController as never,
};

function DateInputRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DateInputRootProps = SolidPrimitiveRootProps<DateInputProps, 'div'>;
export function DateInputRoot(props: DateInputRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={DateInputDefinition} element="div" renderElement={DateInputRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function DateInputLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type DateInputLabelProps = SolidPrimitivePartProps<DateInputController['parts']['label'], 'label', false>;
export function DateInputLabel(props: DateInputLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DateInputDefinition as never}
      part="label"
      element="label"
      renderElement={DateInputLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DateInputSegmentElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type DateInputSegmentProps = SolidPrimitivePartProps<DateInputController['parts']['segment'], 'span', true>;
export function DateInputSegment(props: DateInputSegmentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DateInputDefinition as never}
      part="segment"
      element="span"
      renderElement={DateInputSegmentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function DateInputHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type DateInputHiddenInputProps = SolidPrimitivePartProps<DateInputController['parts']['hiddenInput'], 'input', false>;
export function DateInputHiddenInput(props: DateInputHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DateInputDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={DateInputHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DateInputErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DateInputErrorProps = SolidPrimitivePartProps<DateInputController['parts']['error'], 'div', false>;
export function DateInputError(props: DateInputErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DateInputDefinition as never}
      part="error"
      element="div"
      renderElement={DateInputErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const DateInputProvider = DateInputRoot;
export const DateInput = /* @__PURE__ */ Object.assign(DateInputRoot, { Provider: DateInputProvider, Root: DateInputRoot, Label: DateInputLabel, Segment: DateInputSegment, HiddenInput: DateInputHiddenInput, Error: DateInputError });
