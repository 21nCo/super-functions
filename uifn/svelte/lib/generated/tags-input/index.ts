import type { ComponentProps } from 'svelte';
import TagsInputRootComponent from './Root.svelte';
import TagsInputLabelComponent from './Label.svelte';
import TagsInputControlComponent from './Control.svelte';
import TagsInputItemComponent from './Item.svelte';
import TagsInputItemTextComponent from './ItemText.svelte';
import TagsInputItemDeleteComponent from './ItemDelete.svelte';
import TagsInputInputComponent from './Input.svelte';
import TagsInputClearComponent from './Clear.svelte';
import TagsInputHiddenInputComponent from './HiddenInput.svelte';
import TagsInputErrorComponent from './Error.svelte';

export const TagsInputRoot = TagsInputRootComponent;
export type TagsInputRootProps = ComponentProps<typeof TagsInputRootComponent>;

export const TagsInputLabel = TagsInputLabelComponent;
export type TagsInputLabelProps = ComponentProps<typeof TagsInputLabelComponent>;

export const TagsInputControl = TagsInputControlComponent;
export type TagsInputControlProps = ComponentProps<typeof TagsInputControlComponent>;

export const TagsInputItem = TagsInputItemComponent;
export type TagsInputItemProps = ComponentProps<typeof TagsInputItemComponent>;

export const TagsInputItemText = TagsInputItemTextComponent;
export type TagsInputItemTextProps = ComponentProps<typeof TagsInputItemTextComponent>;

export const TagsInputItemDelete = TagsInputItemDeleteComponent;
export type TagsInputItemDeleteProps = ComponentProps<typeof TagsInputItemDeleteComponent>;

export const TagsInputInput = TagsInputInputComponent;
export type TagsInputInputProps = ComponentProps<typeof TagsInputInputComponent>;

export const TagsInputClear = TagsInputClearComponent;
export type TagsInputClearProps = ComponentProps<typeof TagsInputClearComponent>;

export const TagsInputHiddenInput = TagsInputHiddenInputComponent;
export type TagsInputHiddenInputProps = ComponentProps<typeof TagsInputHiddenInputComponent>;

export const TagsInputError = TagsInputErrorComponent;
export type TagsInputErrorProps = ComponentProps<typeof TagsInputErrorComponent>;

export const TagsInputProvider = TagsInputRoot;
export const TagsInput = Object.assign(TagsInputRoot, { Provider: TagsInputProvider, Root: TagsInputRoot, Label: TagsInputLabel, Control: TagsInputControl, Item: TagsInputItem, ItemText: TagsInputItemText, ItemDelete: TagsInputItemDelete, Input: TagsInputInput, Clear: TagsInputClear, HiddenInput: TagsInputHiddenInput, Error: TagsInputError });
