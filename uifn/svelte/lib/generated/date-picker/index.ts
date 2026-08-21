import type { ComponentProps } from 'svelte';
import DatePickerRootComponent from './Root.svelte';
import DatePickerLabelComponent from './Label.svelte';
import DatePickerInputComponent from './Input.svelte';
import DatePickerSegmentComponent from './Segment.svelte';
import DatePickerTriggerComponent from './Trigger.svelte';
import DatePickerPositionerComponent from './Positioner.svelte';
import DatePickerContentComponent from './Content.svelte';
import DatePickerHeaderComponent from './Header.svelte';
import DatePickerPreviousComponent from './Previous.svelte';
import DatePickerNextComponent from './Next.svelte';
import DatePickerGridComponent from './Grid.svelte';
import DatePickerGridLabelComponent from './GridLabel.svelte';
import DatePickerCellComponent from './Cell.svelte';
import DatePickerCellTriggerComponent from './CellTrigger.svelte';
import DatePickerHiddenInputComponent from './HiddenInput.svelte';

export const DatePickerRoot = DatePickerRootComponent;
export type DatePickerRootProps = ComponentProps<typeof DatePickerRootComponent>;

export const DatePickerLabel = DatePickerLabelComponent;
export type DatePickerLabelProps = ComponentProps<typeof DatePickerLabelComponent>;

export const DatePickerInput = DatePickerInputComponent;
export type DatePickerInputProps = ComponentProps<typeof DatePickerInputComponent>;

export const DatePickerSegment = DatePickerSegmentComponent;
export type DatePickerSegmentProps = ComponentProps<typeof DatePickerSegmentComponent>;

export const DatePickerTrigger = DatePickerTriggerComponent;
export type DatePickerTriggerProps = ComponentProps<typeof DatePickerTriggerComponent>;

export const DatePickerPositioner = DatePickerPositionerComponent;
export type DatePickerPositionerProps = ComponentProps<typeof DatePickerPositionerComponent>;

export const DatePickerContent = DatePickerContentComponent;
export type DatePickerContentProps = ComponentProps<typeof DatePickerContentComponent>;

export const DatePickerHeader = DatePickerHeaderComponent;
export type DatePickerHeaderProps = ComponentProps<typeof DatePickerHeaderComponent>;

export const DatePickerPrevious = DatePickerPreviousComponent;
export type DatePickerPreviousProps = ComponentProps<typeof DatePickerPreviousComponent>;

export const DatePickerNext = DatePickerNextComponent;
export type DatePickerNextProps = ComponentProps<typeof DatePickerNextComponent>;

export const DatePickerGrid = DatePickerGridComponent;
export type DatePickerGridProps = ComponentProps<typeof DatePickerGridComponent>;

export const DatePickerGridLabel = DatePickerGridLabelComponent;
export type DatePickerGridLabelProps = ComponentProps<typeof DatePickerGridLabelComponent>;

export const DatePickerCell = DatePickerCellComponent;
export type DatePickerCellProps = ComponentProps<typeof DatePickerCellComponent>;

export const DatePickerCellTrigger = DatePickerCellTriggerComponent;
export type DatePickerCellTriggerProps = ComponentProps<typeof DatePickerCellTriggerComponent>;

export const DatePickerHiddenInput = DatePickerHiddenInputComponent;
export type DatePickerHiddenInputProps = ComponentProps<typeof DatePickerHiddenInputComponent>;

export const DatePickerProvider = DatePickerRoot;
export const DatePicker = Object.assign(DatePickerRoot, { Provider: DatePickerProvider, Root: DatePickerRoot, Label: DatePickerLabel, Input: DatePickerInput, Segment: DatePickerSegment, Trigger: DatePickerTrigger, Positioner: DatePickerPositioner, Content: DatePickerContent, Header: DatePickerHeader, Previous: DatePickerPrevious, Next: DatePickerNext, Grid: DatePickerGrid, GridLabel: DatePickerGridLabel, Cell: DatePickerCell, CellTrigger: DatePickerCellTrigger, HiddenInput: DatePickerHiddenInput });
