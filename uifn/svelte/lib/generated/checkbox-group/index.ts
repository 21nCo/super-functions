import type { ComponentProps } from 'svelte';
import CheckboxGroupRootComponent from './Root.svelte';
import CheckboxGroupLabelComponent from './Label.svelte';
import CheckboxGroupItemComponent from './Item.svelte';
import CheckboxGroupItemControlComponent from './ItemControl.svelte';
import CheckboxGroupItemIndicatorComponent from './ItemIndicator.svelte';
import CheckboxGroupHiddenInputComponent from './HiddenInput.svelte';
import CheckboxGroupErrorComponent from './Error.svelte';

export const CheckboxGroupRoot = CheckboxGroupRootComponent;
export type CheckboxGroupRootProps = ComponentProps<typeof CheckboxGroupRootComponent>;

export const CheckboxGroupLabel = CheckboxGroupLabelComponent;
export type CheckboxGroupLabelProps = ComponentProps<typeof CheckboxGroupLabelComponent>;

export const CheckboxGroupItem = CheckboxGroupItemComponent;
export type CheckboxGroupItemProps = ComponentProps<typeof CheckboxGroupItemComponent>;

export const CheckboxGroupItemControl = CheckboxGroupItemControlComponent;
export type CheckboxGroupItemControlProps = ComponentProps<typeof CheckboxGroupItemControlComponent>;

export const CheckboxGroupItemIndicator = CheckboxGroupItemIndicatorComponent;
export type CheckboxGroupItemIndicatorProps = ComponentProps<typeof CheckboxGroupItemIndicatorComponent>;

export const CheckboxGroupHiddenInput = CheckboxGroupHiddenInputComponent;
export type CheckboxGroupHiddenInputProps = ComponentProps<typeof CheckboxGroupHiddenInputComponent>;

export const CheckboxGroupError = CheckboxGroupErrorComponent;
export type CheckboxGroupErrorProps = ComponentProps<typeof CheckboxGroupErrorComponent>;

export const CheckboxGroupProvider = CheckboxGroupRoot;
export const CheckboxGroup = Object.assign(CheckboxGroupRoot, { Provider: CheckboxGroupProvider, Root: CheckboxGroupRoot, Label: CheckboxGroupLabel, Item: CheckboxGroupItem, ItemControl: CheckboxGroupItemControl, ItemIndicator: CheckboxGroupItemIndicator, HiddenInput: CheckboxGroupHiddenInput, Error: CheckboxGroupError });
