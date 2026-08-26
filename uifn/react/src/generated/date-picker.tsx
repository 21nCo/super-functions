'use client';

import * as React from 'react';
import { createDatePickerController, type DatePickerProps, type DatePickerController } from '@uifn/core/primitives/date-picker';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const DatePickerContext = React.createContext<ReactPrimitiveBridge<DatePickerProps> | null>(null);
const DatePickerDefinition: ReactPrimitiveDefinition<DatePickerProps> = {
  name: 'DatePicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","locale","timeZone","min","max","unavailable","name","disabled","readOnly"],
  context: DatePickerContext,
  createController: createDatePickerController as never,
};

export type DatePickerRootProps = ReactPrimitiveRootProps<DatePickerProps, 'div'>;
export const DatePickerRoot = React.forwardRef<React.ElementRef<'div'>, DatePickerRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={DatePickerDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerRoot.displayName = 'DatePickerRoot';

export type DatePickerLabelProps = ReactPrimitivePartProps<DatePickerController['parts']['label'], 'label', false>;
export const DatePickerLabel = React.forwardRef<React.ElementRef<'label'>, DatePickerLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerLabel.displayName = 'DatePickerLabel';

export type DatePickerInputProps = ReactPrimitivePartProps<DatePickerController['parts']['input'], 'div', false>;
export const DatePickerInput = React.forwardRef<React.ElementRef<'div'>, DatePickerInputProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="input" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerInput.displayName = 'DatePickerInput';

export type DatePickerSegmentProps = ReactPrimitivePartProps<DatePickerController['parts']['segment'], 'span', true>;
export const DatePickerSegment = React.forwardRef<React.ElementRef<'span'>, DatePickerSegmentProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="segment" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerSegment.displayName = 'DatePickerSegment';

export type DatePickerTriggerProps = ReactPrimitivePartProps<DatePickerController['parts']['trigger'], 'button', false>;
export const DatePickerTrigger = React.forwardRef<React.ElementRef<'button'>, DatePickerTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerTrigger.displayName = 'DatePickerTrigger';

export type DatePickerPositionerProps = ReactPrimitivePartProps<DatePickerController['parts']['positioner'], 'div', false>;
export const DatePickerPositioner = React.forwardRef<React.ElementRef<'div'>, DatePickerPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerPositioner.displayName = 'DatePickerPositioner';

export type DatePickerContentProps = ReactPrimitivePartProps<DatePickerController['parts']['content'], 'div', false>;
export const DatePickerContent = React.forwardRef<React.ElementRef<'div'>, DatePickerContentProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerContent.displayName = 'DatePickerContent';

export type DatePickerHeaderProps = ReactPrimitivePartProps<DatePickerController['parts']['header'], 'div', false>;
export const DatePickerHeader = React.forwardRef<React.ElementRef<'div'>, DatePickerHeaderProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="header" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerHeader.displayName = 'DatePickerHeader';

export type DatePickerPreviousProps = ReactPrimitivePartProps<DatePickerController['parts']['previous'], 'button', false>;
export const DatePickerPrevious = React.forwardRef<React.ElementRef<'button'>, DatePickerPreviousProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="previous" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerPrevious.displayName = 'DatePickerPrevious';

export type DatePickerNextProps = ReactPrimitivePartProps<DatePickerController['parts']['next'], 'button', false>;
export const DatePickerNext = React.forwardRef<React.ElementRef<'button'>, DatePickerNextProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="next" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerNext.displayName = 'DatePickerNext';

export type DatePickerGridProps = ReactPrimitivePartProps<DatePickerController['parts']['grid'], 'table', false>;
export const DatePickerGrid = React.forwardRef<React.ElementRef<'table'>, DatePickerGridProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="grid" element="table" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerGrid.displayName = 'DatePickerGrid';

export type DatePickerGridLabelProps = ReactPrimitivePartProps<DatePickerController['parts']['gridLabel'], 'caption', false>;
export const DatePickerGridLabel = React.forwardRef<React.ElementRef<'caption'>, DatePickerGridLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="gridLabel" element="caption" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerGridLabel.displayName = 'DatePickerGridLabel';

export type DatePickerCellProps = ReactPrimitivePartProps<DatePickerController['parts']['cell'], 'td', true>;
export const DatePickerCell = React.forwardRef<React.ElementRef<'td'>, DatePickerCellProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="cell" element="td" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerCell.displayName = 'DatePickerCell';

export type DatePickerCellTriggerProps = ReactPrimitivePartProps<DatePickerController['parts']['cellTrigger'], 'button', true>;
export const DatePickerCellTrigger = React.forwardRef<React.ElementRef<'button'>, DatePickerCellTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="cellTrigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerCellTrigger.displayName = 'DatePickerCellTrigger';

export type DatePickerHiddenInputProps = ReactPrimitivePartProps<DatePickerController['parts']['hiddenInput'], 'input', false>;
export const DatePickerHiddenInput = React.forwardRef<React.ElementRef<'input'>, DatePickerHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={DatePickerDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DatePickerHiddenInput.displayName = 'DatePickerHiddenInput';

export const DatePickerProvider = DatePickerRoot;
export function useDatePicker(inputs: DatePickerProps = {} as DatePickerProps): ReactPrimitiveHookResult<DatePickerController['state'], DatePickerController['actions']> {
  return useReactPrimitive(DatePickerDefinition, inputs) as ReactPrimitiveHookResult<DatePickerController['state'], DatePickerController['actions']>;
}
export const DatePicker = Object.assign(DatePickerRoot, { Provider: DatePickerProvider, Root: DatePickerRoot, Label: DatePickerLabel, Input: DatePickerInput, Segment: DatePickerSegment, Trigger: DatePickerTrigger, Positioner: DatePickerPositioner, Content: DatePickerContent, Header: DatePickerHeader, Previous: DatePickerPrevious, Next: DatePickerNext, Grid: DatePickerGrid, GridLabel: DatePickerGridLabel, Cell: DatePickerCell, CellTrigger: DatePickerCellTrigger, HiddenInput: DatePickerHiddenInput });
