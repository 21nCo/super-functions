import type { ComponentProps } from 'svelte';
import DateInputRootComponent from './Root.svelte';
import DateInputLabelComponent from './Label.svelte';
import DateInputSegmentComponent from './Segment.svelte';
import DateInputHiddenInputComponent from './HiddenInput.svelte';
import DateInputErrorComponent from './Error.svelte';

export const DateInputRoot = DateInputRootComponent;
export type DateInputRootProps = ComponentProps<typeof DateInputRootComponent>;

export const DateInputLabel = DateInputLabelComponent;
export type DateInputLabelProps = ComponentProps<typeof DateInputLabelComponent>;

export const DateInputSegment = DateInputSegmentComponent;
export type DateInputSegmentProps = ComponentProps<typeof DateInputSegmentComponent>;

export const DateInputHiddenInput = DateInputHiddenInputComponent;
export type DateInputHiddenInputProps = ComponentProps<typeof DateInputHiddenInputComponent>;

export const DateInputError = DateInputErrorComponent;
export type DateInputErrorProps = ComponentProps<typeof DateInputErrorComponent>;

export const DateInputProvider = DateInputRoot;
export const DateInput = Object.assign(DateInputRoot, { Provider: DateInputProvider, Root: DateInputRoot, Label: DateInputLabel, Segment: DateInputSegment, HiddenInput: DateInputHiddenInput, Error: DateInputError });
