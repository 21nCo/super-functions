import type { ComponentProps } from 'svelte';
import RadioGroupRootComponent from './Root.svelte';
import RadioGroupLabelComponent from './Label.svelte';
import RadioGroupItemComponent from './Item.svelte';
import RadioGroupItemControlComponent from './ItemControl.svelte';
import RadioGroupItemIndicatorComponent from './ItemIndicator.svelte';
import RadioGroupHiddenInputComponent from './HiddenInput.svelte';
import RadioGroupErrorComponent from './Error.svelte';

export const RadioGroupRoot = RadioGroupRootComponent;
export type RadioGroupRootProps = ComponentProps<typeof RadioGroupRootComponent>;

export const RadioGroupLabel = RadioGroupLabelComponent;
export type RadioGroupLabelProps = ComponentProps<typeof RadioGroupLabelComponent>;

export const RadioGroupItem = RadioGroupItemComponent;
export type RadioGroupItemProps = ComponentProps<typeof RadioGroupItemComponent>;

export const RadioGroupItemControl = RadioGroupItemControlComponent;
export type RadioGroupItemControlProps = ComponentProps<typeof RadioGroupItemControlComponent>;

export const RadioGroupItemIndicator = RadioGroupItemIndicatorComponent;
export type RadioGroupItemIndicatorProps = ComponentProps<typeof RadioGroupItemIndicatorComponent>;

export const RadioGroupHiddenInput = RadioGroupHiddenInputComponent;
export type RadioGroupHiddenInputProps = ComponentProps<typeof RadioGroupHiddenInputComponent>;

export const RadioGroupError = RadioGroupErrorComponent;
export type RadioGroupErrorProps = ComponentProps<typeof RadioGroupErrorComponent>;

export const RadioGroupProvider = RadioGroupRoot;
export const RadioGroup = Object.assign(RadioGroupRoot, { Provider: RadioGroupProvider, Root: RadioGroupRoot, Label: RadioGroupLabel, Item: RadioGroupItem, ItemControl: RadioGroupItemControl, ItemIndicator: RadioGroupItemIndicator, HiddenInput: RadioGroupHiddenInput, Error: RadioGroupError });
