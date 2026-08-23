import type { ComponentProps } from 'svelte';
import ButtonRootComponent from './Root.svelte';
import ButtonIconComponent from './Icon.svelte';
import ButtonLabelComponent from './Label.svelte';
import ButtonSpinnerComponent from './Spinner.svelte';

export const ButtonRoot = ButtonRootComponent;
export type ButtonRootProps = ComponentProps<typeof ButtonRootComponent>;

export const ButtonIcon = ButtonIconComponent;
export type ButtonIconProps = ComponentProps<typeof ButtonIconComponent>;

export const ButtonLabel = ButtonLabelComponent;
export type ButtonLabelProps = ComponentProps<typeof ButtonLabelComponent>;

export const ButtonSpinner = ButtonSpinnerComponent;
export type ButtonSpinnerProps = ComponentProps<typeof ButtonSpinnerComponent>;

export const ButtonProvider = ButtonRoot;
export const Button = Object.assign(ButtonRoot, { Provider: ButtonProvider, Root: ButtonRoot, Icon: ButtonIcon, Label: ButtonLabel, Spinner: ButtonSpinner });
