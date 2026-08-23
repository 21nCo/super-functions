import type { ComponentProps } from 'svelte';
import ComboboxRootComponent from './Root.svelte';
import ComboboxLabelComponent from './Label.svelte';
import ComboboxControlComponent from './Control.svelte';
import ComboboxInputComponent from './Input.svelte';
import ComboboxTriggerComponent from './Trigger.svelte';
import ComboboxClearComponent from './Clear.svelte';
import ComboboxPositionerComponent from './Positioner.svelte';
import ComboboxContentComponent from './Content.svelte';
import ComboboxItemComponent from './Item.svelte';
import ComboboxItemIndicatorComponent from './ItemIndicator.svelte';
import ComboboxEmptyComponent from './Empty.svelte';
import ComboboxHiddenInputComponent from './HiddenInput.svelte';

export const ComboboxRoot = ComboboxRootComponent;
export type ComboboxRootProps = ComponentProps<typeof ComboboxRootComponent>;

export const ComboboxLabel = ComboboxLabelComponent;
export type ComboboxLabelProps = ComponentProps<typeof ComboboxLabelComponent>;

export const ComboboxControl = ComboboxControlComponent;
export type ComboboxControlProps = ComponentProps<typeof ComboboxControlComponent>;

export const ComboboxInput = ComboboxInputComponent;
export type ComboboxInputProps = ComponentProps<typeof ComboboxInputComponent>;

export const ComboboxTrigger = ComboboxTriggerComponent;
export type ComboboxTriggerProps = ComponentProps<typeof ComboboxTriggerComponent>;

export const ComboboxClear = ComboboxClearComponent;
export type ComboboxClearProps = ComponentProps<typeof ComboboxClearComponent>;

export const ComboboxPositioner = ComboboxPositionerComponent;
export type ComboboxPositionerProps = ComponentProps<typeof ComboboxPositionerComponent>;

export const ComboboxContent = ComboboxContentComponent;
export type ComboboxContentProps = ComponentProps<typeof ComboboxContentComponent>;

export const ComboboxItem = ComboboxItemComponent;
export type ComboboxItemProps = ComponentProps<typeof ComboboxItemComponent>;

export const ComboboxItemIndicator = ComboboxItemIndicatorComponent;
export type ComboboxItemIndicatorProps = ComponentProps<typeof ComboboxItemIndicatorComponent>;

export const ComboboxEmpty = ComboboxEmptyComponent;
export type ComboboxEmptyProps = ComponentProps<typeof ComboboxEmptyComponent>;

export const ComboboxHiddenInput = ComboboxHiddenInputComponent;
export type ComboboxHiddenInputProps = ComponentProps<typeof ComboboxHiddenInputComponent>;

export const ComboboxProvider = ComboboxRoot;
export const Combobox = Object.assign(ComboboxRoot, { Provider: ComboboxProvider, Root: ComboboxRoot, Label: ComboboxLabel, Control: ComboboxControl, Input: ComboboxInput, Trigger: ComboboxTrigger, Clear: ComboboxClear, Positioner: ComboboxPositioner, Content: ComboboxContent, Item: ComboboxItem, ItemIndicator: ComboboxItemIndicator, Empty: ComboboxEmpty, HiddenInput: ComboboxHiddenInput });
