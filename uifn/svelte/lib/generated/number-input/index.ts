import type { ComponentProps } from 'svelte';
import NumberInputRootComponent from './Root.svelte';
import NumberInputLabelComponent from './Label.svelte';
import NumberInputControlComponent from './Control.svelte';
import NumberInputInputComponent from './Input.svelte';
import NumberInputIncrementComponent from './Increment.svelte';
import NumberInputDecrementComponent from './Decrement.svelte';
import NumberInputScrubberComponent from './Scrubber.svelte';
import NumberInputHiddenInputComponent from './HiddenInput.svelte';
import NumberInputErrorComponent from './Error.svelte';

export const NumberInputRoot = NumberInputRootComponent;
export type NumberInputRootProps = ComponentProps<typeof NumberInputRootComponent>;

export const NumberInputLabel = NumberInputLabelComponent;
export type NumberInputLabelProps = ComponentProps<typeof NumberInputLabelComponent>;

export const NumberInputControl = NumberInputControlComponent;
export type NumberInputControlProps = ComponentProps<typeof NumberInputControlComponent>;

export const NumberInputInput = NumberInputInputComponent;
export type NumberInputInputProps = ComponentProps<typeof NumberInputInputComponent>;

export const NumberInputIncrement = NumberInputIncrementComponent;
export type NumberInputIncrementProps = ComponentProps<typeof NumberInputIncrementComponent>;

export const NumberInputDecrement = NumberInputDecrementComponent;
export type NumberInputDecrementProps = ComponentProps<typeof NumberInputDecrementComponent>;

export const NumberInputScrubber = NumberInputScrubberComponent;
export type NumberInputScrubberProps = ComponentProps<typeof NumberInputScrubberComponent>;

export const NumberInputHiddenInput = NumberInputHiddenInputComponent;
export type NumberInputHiddenInputProps = ComponentProps<typeof NumberInputHiddenInputComponent>;

export const NumberInputError = NumberInputErrorComponent;
export type NumberInputErrorProps = ComponentProps<typeof NumberInputErrorComponent>;

export const NumberInputProvider = NumberInputRoot;
export const NumberInput = Object.assign(NumberInputRoot, { Provider: NumberInputProvider, Root: NumberInputRoot, Label: NumberInputLabel, Control: NumberInputControl, Input: NumberInputInput, Increment: NumberInputIncrement, Decrement: NumberInputDecrement, Scrubber: NumberInputScrubber, HiddenInput: NumberInputHiddenInput, Error: NumberInputError });
