import type { ComponentProps } from 'svelte';
import SwitchRootComponent from './Root.svelte';
import SwitchControlComponent from './Control.svelte';
import SwitchThumbComponent from './Thumb.svelte';
import SwitchLabelComponent from './Label.svelte';
import SwitchHiddenInputComponent from './HiddenInput.svelte';

export const SwitchRoot = SwitchRootComponent;
export type SwitchRootProps = ComponentProps<typeof SwitchRootComponent>;

export const SwitchControl = SwitchControlComponent;
export type SwitchControlProps = ComponentProps<typeof SwitchControlComponent>;

export const SwitchThumb = SwitchThumbComponent;
export type SwitchThumbProps = ComponentProps<typeof SwitchThumbComponent>;

export const SwitchLabel = SwitchLabelComponent;
export type SwitchLabelProps = ComponentProps<typeof SwitchLabelComponent>;

export const SwitchHiddenInput = SwitchHiddenInputComponent;
export type SwitchHiddenInputProps = ComponentProps<typeof SwitchHiddenInputComponent>;

export const SwitchProvider = SwitchRoot;
export const Switch = Object.assign(SwitchRoot, { Provider: SwitchProvider, Root: SwitchRoot, Control: SwitchControl, Thumb: SwitchThumb, Label: SwitchLabel, HiddenInput: SwitchHiddenInput });
