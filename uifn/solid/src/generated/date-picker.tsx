import { createContext, type JSX } from 'solid-js';
import { createDatePickerController, type DatePickerProps, type DatePickerController } from '@uifn/core/primitives/date-picker';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const DatePickerContext = createContext<SolidPrimitiveContextValue<DatePickerProps>>();
export const DatePickerDefinition: SolidPrimitiveDefinition<DatePickerProps> = {
  name: 'DatePicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","locale","timeZone","min","max","unavailable","name"],
  context: DatePickerContext,
  createController: createDatePickerController as never,
};

function DatePickerRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DatePickerRootProps = SolidPrimitiveRootProps<DatePickerProps, 'div'>;
export function DatePickerRoot(props: DatePickerRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={DatePickerDefinition} element="div" renderElement={DatePickerRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function DatePickerLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type DatePickerLabelProps = SolidPrimitivePartProps<DatePickerController['parts']['label'], 'label', false>;
export function DatePickerLabel(props: DatePickerLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="label"
      element="label"
      renderElement={DatePickerLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerInputElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DatePickerInputProps = SolidPrimitivePartProps<DatePickerController['parts']['input'], 'div', false>;
export function DatePickerInput(props: DatePickerInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="input"
      element="div"
      renderElement={DatePickerInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerSegmentElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type DatePickerSegmentProps = SolidPrimitivePartProps<DatePickerController['parts']['segment'], 'span', true>;
export function DatePickerSegment(props: DatePickerSegmentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="segment"
      element="span"
      renderElement={DatePickerSegmentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function DatePickerTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DatePickerTriggerProps = SolidPrimitivePartProps<DatePickerController['parts']['trigger'], 'button', false>;
export function DatePickerTrigger(props: DatePickerTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="trigger"
      element="button"
      renderElement={DatePickerTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DatePickerPositionerProps = SolidPrimitivePartProps<DatePickerController['parts']['positioner'], 'div', false>;
export function DatePickerPositioner(props: DatePickerPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="positioner"
      element="div"
      renderElement={DatePickerPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DatePickerContentProps = SolidPrimitivePartProps<DatePickerController['parts']['content'], 'div', false>;
export function DatePickerContent(props: DatePickerContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="content"
      element="div"
      renderElement={DatePickerContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerHeaderElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DatePickerHeaderProps = SolidPrimitivePartProps<DatePickerController['parts']['header'], 'div', false>;
export function DatePickerHeader(props: DatePickerHeaderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="header"
      element="div"
      renderElement={DatePickerHeaderElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerPreviousElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DatePickerPreviousProps = SolidPrimitivePartProps<DatePickerController['parts']['previous'], 'button', false>;
export function DatePickerPrevious(props: DatePickerPreviousProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="previous"
      element="button"
      renderElement={DatePickerPreviousElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerNextElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DatePickerNextProps = SolidPrimitivePartProps<DatePickerController['parts']['next'], 'button', false>;
export function DatePickerNext(props: DatePickerNextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="next"
      element="button"
      renderElement={DatePickerNextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerGridElement(props: JSX.IntrinsicElements['table']): JSX.Element {
  return <table {...props} />;
}

export type DatePickerGridProps = SolidPrimitivePartProps<DatePickerController['parts']['grid'], 'table', false>;
export function DatePickerGrid(props: DatePickerGridProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="grid"
      element="table"
      renderElement={DatePickerGridElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerGridLabelElement(props: JSX.IntrinsicElements['caption']): JSX.Element {
  return <caption {...props} />;
}

export type DatePickerGridLabelProps = SolidPrimitivePartProps<DatePickerController['parts']['gridLabel'], 'caption', false>;
export function DatePickerGridLabel(props: DatePickerGridLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="gridLabel"
      element="caption"
      renderElement={DatePickerGridLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DatePickerCellElement(props: JSX.IntrinsicElements['td']): JSX.Element {
  return <td {...props} />;
}

export type DatePickerCellProps = SolidPrimitivePartProps<DatePickerController['parts']['cell'], 'td', true>;
export function DatePickerCell(props: DatePickerCellProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="cell"
      element="td"
      renderElement={DatePickerCellElement as never}
      many={true}
      props={props as never}
    />
  );
}

function DatePickerCellTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DatePickerCellTriggerProps = SolidPrimitivePartProps<DatePickerController['parts']['cellTrigger'], 'button', true>;
export function DatePickerCellTrigger(props: DatePickerCellTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="cellTrigger"
      element="button"
      renderElement={DatePickerCellTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function DatePickerHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type DatePickerHiddenInputProps = SolidPrimitivePartProps<DatePickerController['parts']['hiddenInput'], 'input', false>;
export function DatePickerHiddenInput(props: DatePickerHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DatePickerDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={DatePickerHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const DatePickerProvider = DatePickerRoot;
export const DatePicker = /* @__PURE__ */ Object.assign(DatePickerRoot, { Provider: DatePickerProvider, Root: DatePickerRoot, Label: DatePickerLabel, Input: DatePickerInput, Segment: DatePickerSegment, Trigger: DatePickerTrigger, Positioner: DatePickerPositioner, Content: DatePickerContent, Header: DatePickerHeader, Previous: DatePickerPrevious, Next: DatePickerNext, Grid: DatePickerGrid, GridLabel: DatePickerGridLabel, Cell: DatePickerCell, CellTrigger: DatePickerCellTrigger, HiddenInput: DatePickerHiddenInput });
