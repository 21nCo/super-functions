import type { ComponentProps } from 'svelte';
import ListboxRootComponent from './Root.svelte';
import ListboxLabelComponent from './Label.svelte';
import ListboxContentComponent from './Content.svelte';
import ListboxItemComponent from './Item.svelte';
import ListboxItemIndicatorComponent from './ItemIndicator.svelte';
import ListboxGroupComponent from './Group.svelte';
import ListboxGroupLabelComponent from './GroupLabel.svelte';
import ListboxHiddenInputComponent from './HiddenInput.svelte';

export const ListboxRoot = ListboxRootComponent;
export type ListboxRootProps = ComponentProps<typeof ListboxRootComponent>;

export const ListboxLabel = ListboxLabelComponent;
export type ListboxLabelProps = ComponentProps<typeof ListboxLabelComponent>;

export const ListboxContent = ListboxContentComponent;
export type ListboxContentProps = ComponentProps<typeof ListboxContentComponent>;

export const ListboxItem = ListboxItemComponent;
export type ListboxItemProps = ComponentProps<typeof ListboxItemComponent>;

export const ListboxItemIndicator = ListboxItemIndicatorComponent;
export type ListboxItemIndicatorProps = ComponentProps<typeof ListboxItemIndicatorComponent>;

export const ListboxGroup = ListboxGroupComponent;
export type ListboxGroupProps = ComponentProps<typeof ListboxGroupComponent>;

export const ListboxGroupLabel = ListboxGroupLabelComponent;
export type ListboxGroupLabelProps = ComponentProps<typeof ListboxGroupLabelComponent>;

export const ListboxHiddenInput = ListboxHiddenInputComponent;
export type ListboxHiddenInputProps = ComponentProps<typeof ListboxHiddenInputComponent>;

export const ListboxProvider = ListboxRoot;
export const Listbox = Object.assign(ListboxRoot, { Provider: ListboxProvider, Root: ListboxRoot, Label: ListboxLabel, Content: ListboxContent, Item: ListboxItem, ItemIndicator: ListboxItemIndicator, Group: ListboxGroup, GroupLabel: ListboxGroupLabel, HiddenInput: ListboxHiddenInput });
