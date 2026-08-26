import type { ComponentProps } from 'svelte';
import CheckboxRootComponent from './Root.svelte';
import CheckboxControlComponent from './Control.svelte';
import CheckboxIndicatorComponent from './Indicator.svelte';
import CheckboxLabelComponent from './Label.svelte';
import CheckboxHiddenInputComponent from './HiddenInput.svelte';

export const CheckboxRoot = CheckboxRootComponent;
export type CheckboxRootProps = ComponentProps<typeof CheckboxRootComponent>;

export const CheckboxControl = CheckboxControlComponent;
export type CheckboxControlProps = ComponentProps<typeof CheckboxControlComponent>;

export const CheckboxIndicator = CheckboxIndicatorComponent;
export type CheckboxIndicatorProps = ComponentProps<typeof CheckboxIndicatorComponent>;

export const CheckboxLabel = CheckboxLabelComponent;
export type CheckboxLabelProps = ComponentProps<typeof CheckboxLabelComponent>;

export const CheckboxHiddenInput = CheckboxHiddenInputComponent;
export type CheckboxHiddenInputProps = ComponentProps<typeof CheckboxHiddenInputComponent>;

export const CheckboxProvider = CheckboxRoot;
export const Checkbox = Object.assign(CheckboxRoot, { Provider: CheckboxProvider, Root: CheckboxRoot, Control: CheckboxControl, Indicator: CheckboxIndicator, Label: CheckboxLabel, HiddenInput: CheckboxHiddenInput });
