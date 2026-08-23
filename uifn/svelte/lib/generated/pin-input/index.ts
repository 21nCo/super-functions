import type { ComponentProps } from 'svelte';
import PinInputRootComponent from './Root.svelte';
import PinInputLabelComponent from './Label.svelte';
import PinInputControlComponent from './Control.svelte';
import PinInputInputComponent from './Input.svelte';
import PinInputHiddenInputComponent from './HiddenInput.svelte';
import PinInputErrorComponent from './Error.svelte';

export const PinInputRoot = PinInputRootComponent;
export type PinInputRootProps = ComponentProps<typeof PinInputRootComponent>;

export const PinInputLabel = PinInputLabelComponent;
export type PinInputLabelProps = ComponentProps<typeof PinInputLabelComponent>;

export const PinInputControl = PinInputControlComponent;
export type PinInputControlProps = ComponentProps<typeof PinInputControlComponent>;

export const PinInputInput = PinInputInputComponent;
export type PinInputInputProps = ComponentProps<typeof PinInputInputComponent>;

export const PinInputHiddenInput = PinInputHiddenInputComponent;
export type PinInputHiddenInputProps = ComponentProps<typeof PinInputHiddenInputComponent>;

export const PinInputError = PinInputErrorComponent;
export type PinInputErrorProps = ComponentProps<typeof PinInputErrorComponent>;

export const PinInputProvider = PinInputRoot;
export const PinInput = Object.assign(PinInputRoot, { Provider: PinInputProvider, Root: PinInputRoot, Label: PinInputLabel, Control: PinInputControl, Input: PinInputInput, HiddenInput: PinInputHiddenInput, Error: PinInputError });
