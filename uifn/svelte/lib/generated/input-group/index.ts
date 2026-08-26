import type { ComponentProps } from 'svelte';
import InputGroupRootComponent from './Root.svelte';
import InputGroupAddonComponent from './Addon.svelte';
import InputGroupTextComponent from './Text.svelte';
import InputGroupControlComponent from './Control.svelte';
import InputGroupInputComponent from './Input.svelte';
import InputGroupTextareaComponent from './Textarea.svelte';
import InputGroupButtonComponent from './Button.svelte';

export const InputGroupRoot = InputGroupRootComponent;
export type InputGroupRootProps = ComponentProps<typeof InputGroupRootComponent>;

export const InputGroupAddon = InputGroupAddonComponent;
export type InputGroupAddonProps = ComponentProps<typeof InputGroupAddonComponent>;

export const InputGroupText = InputGroupTextComponent;
export type InputGroupTextProps = ComponentProps<typeof InputGroupTextComponent>;

export const InputGroupControl = InputGroupControlComponent;
export type InputGroupControlProps = ComponentProps<typeof InputGroupControlComponent>;

export const InputGroupInput = InputGroupInputComponent;
export type InputGroupInputProps = ComponentProps<typeof InputGroupInputComponent>;

export const InputGroupTextarea = InputGroupTextareaComponent;
export type InputGroupTextareaProps = ComponentProps<typeof InputGroupTextareaComponent>;

export const InputGroupButton = InputGroupButtonComponent;
export type InputGroupButtonProps = ComponentProps<typeof InputGroupButtonComponent>;

export const InputGroupProvider = InputGroupRoot;
export const InputGroup = Object.assign(InputGroupRoot, { Provider: InputGroupProvider, Root: InputGroupRoot, Addon: InputGroupAddon, Text: InputGroupText, Control: InputGroupControl, Input: InputGroupInput, Textarea: InputGroupTextarea, Button: InputGroupButton });
