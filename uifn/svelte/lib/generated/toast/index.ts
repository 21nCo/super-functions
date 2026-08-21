import type { ComponentProps } from 'svelte';
import ToastViewportComponent from './Viewport.svelte';
import ToastRootComponent from './Root.svelte';
import ToastTitleComponent from './Title.svelte';
import ToastDescriptionComponent from './Description.svelte';
import ToastActionComponent from './Action.svelte';
import ToastCloseComponent from './Close.svelte';

export const ToastViewport = ToastViewportComponent;
export type ToastViewportProps = ComponentProps<typeof ToastViewportComponent>;

export const ToastRoot = ToastRootComponent;
export type ToastRootProps = ComponentProps<typeof ToastRootComponent>;

export const ToastTitle = ToastTitleComponent;
export type ToastTitleProps = ComponentProps<typeof ToastTitleComponent>;

export const ToastDescription = ToastDescriptionComponent;
export type ToastDescriptionProps = ComponentProps<typeof ToastDescriptionComponent>;

export const ToastAction = ToastActionComponent;
export type ToastActionProps = ComponentProps<typeof ToastActionComponent>;

export const ToastClose = ToastCloseComponent;
export type ToastCloseProps = ComponentProps<typeof ToastCloseComponent>;

export const ToastProvider = ToastViewport;
export const Toast = Object.assign(ToastViewport, { Provider: ToastProvider, Root: ToastRoot, Viewport: ToastViewport, Title: ToastTitle, Description: ToastDescription, Action: ToastAction, Close: ToastClose });
