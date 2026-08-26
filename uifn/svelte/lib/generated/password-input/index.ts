import type { ComponentProps } from 'svelte';
import PasswordInputRootComponent from './Root.svelte';
import PasswordInputLabelComponent from './Label.svelte';
import PasswordInputInputComponent from './Input.svelte';
import PasswordInputVisibilityTriggerComponent from './VisibilityTrigger.svelte';
import PasswordInputStrengthComponent from './Strength.svelte';
import PasswordInputErrorComponent from './Error.svelte';

export const PasswordInputRoot = PasswordInputRootComponent;
export type PasswordInputRootProps = ComponentProps<typeof PasswordInputRootComponent>;

export const PasswordInputLabel = PasswordInputLabelComponent;
export type PasswordInputLabelProps = ComponentProps<typeof PasswordInputLabelComponent>;

export const PasswordInputInput = PasswordInputInputComponent;
export type PasswordInputInputProps = ComponentProps<typeof PasswordInputInputComponent>;

export const PasswordInputVisibilityTrigger = PasswordInputVisibilityTriggerComponent;
export type PasswordInputVisibilityTriggerProps = ComponentProps<typeof PasswordInputVisibilityTriggerComponent>;

export const PasswordInputStrength = PasswordInputStrengthComponent;
export type PasswordInputStrengthProps = ComponentProps<typeof PasswordInputStrengthComponent>;

export const PasswordInputError = PasswordInputErrorComponent;
export type PasswordInputErrorProps = ComponentProps<typeof PasswordInputErrorComponent>;

export const PasswordInputProvider = PasswordInputRoot;
export const PasswordInput = Object.assign(PasswordInputRoot, { Provider: PasswordInputProvider, Root: PasswordInputRoot, Label: PasswordInputLabel, Input: PasswordInputInput, VisibilityTrigger: PasswordInputVisibilityTrigger, Strength: PasswordInputStrength, Error: PasswordInputError });
