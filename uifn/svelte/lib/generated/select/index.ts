import type { ComponentProps } from 'svelte';
import SelectRootComponent from './Root.svelte';
import SelectLabelComponent from './Label.svelte';
import SelectControlComponent from './Control.svelte';
import SelectTriggerComponent from './Trigger.svelte';
import SelectValueTextComponent from './ValueText.svelte';
import SelectClearComponent from './Clear.svelte';
import SelectPositionerComponent from './Positioner.svelte';
import SelectContentComponent from './Content.svelte';
import SelectItemComponent from './Item.svelte';
import SelectItemTextComponent from './ItemText.svelte';
import SelectItemIndicatorComponent from './ItemIndicator.svelte';
import SelectGroupComponent from './Group.svelte';
import SelectGroupLabelComponent from './GroupLabel.svelte';
import SelectHiddenInputComponent from './HiddenInput.svelte';

export const SelectRoot = SelectRootComponent;
export type SelectRootProps = ComponentProps<typeof SelectRootComponent>;

export const SelectLabel = SelectLabelComponent;
export type SelectLabelProps = ComponentProps<typeof SelectLabelComponent>;

export const SelectControl = SelectControlComponent;
export type SelectControlProps = ComponentProps<typeof SelectControlComponent>;

export const SelectTrigger = SelectTriggerComponent;
export type SelectTriggerProps = ComponentProps<typeof SelectTriggerComponent>;

export const SelectValueText = SelectValueTextComponent;
export type SelectValueTextProps = ComponentProps<typeof SelectValueTextComponent>;

export const SelectClear = SelectClearComponent;
export type SelectClearProps = ComponentProps<typeof SelectClearComponent>;

export const SelectPositioner = SelectPositionerComponent;
export type SelectPositionerProps = ComponentProps<typeof SelectPositionerComponent>;

export const SelectContent = SelectContentComponent;
export type SelectContentProps = ComponentProps<typeof SelectContentComponent>;

export const SelectItem = SelectItemComponent;
export type SelectItemProps = ComponentProps<typeof SelectItemComponent>;

export const SelectItemText = SelectItemTextComponent;
export type SelectItemTextProps = ComponentProps<typeof SelectItemTextComponent>;

export const SelectItemIndicator = SelectItemIndicatorComponent;
export type SelectItemIndicatorProps = ComponentProps<typeof SelectItemIndicatorComponent>;

export const SelectGroup = SelectGroupComponent;
export type SelectGroupProps = ComponentProps<typeof SelectGroupComponent>;

export const SelectGroupLabel = SelectGroupLabelComponent;
export type SelectGroupLabelProps = ComponentProps<typeof SelectGroupLabelComponent>;

export const SelectHiddenInput = SelectHiddenInputComponent;
export type SelectHiddenInputProps = ComponentProps<typeof SelectHiddenInputComponent>;

export const SelectProvider = SelectRoot;
export const Select = Object.assign(SelectRoot, { Provider: SelectProvider, Root: SelectRoot, Label: SelectLabel, Control: SelectControl, Trigger: SelectTrigger, ValueText: SelectValueText, Clear: SelectClear, Positioner: SelectPositioner, Content: SelectContent, Item: SelectItem, ItemText: SelectItemText, ItemIndicator: SelectItemIndicator, Group: SelectGroup, GroupLabel: SelectGroupLabel, HiddenInput: SelectHiddenInput });
