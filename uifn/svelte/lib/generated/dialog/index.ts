import type { ComponentProps } from 'svelte';
import DialogRootComponent from './Root.svelte';
import DialogTriggerComponent from './Trigger.svelte';
import DialogPortalComponent from './Portal.svelte';
import DialogBackdropComponent from './Backdrop.svelte';
import DialogPositionerComponent from './Positioner.svelte';
import DialogContentComponent from './Content.svelte';
import DialogTitleComponent from './Title.svelte';
import DialogDescriptionComponent from './Description.svelte';
import DialogCloseComponent from './Close.svelte';

export const DialogRoot = DialogRootComponent;
export type DialogRootProps = ComponentProps<typeof DialogRootComponent>;

export const DialogTrigger = DialogTriggerComponent;
export type DialogTriggerProps = ComponentProps<typeof DialogTriggerComponent>;

export const DialogPortal = DialogPortalComponent;
export type DialogPortalProps = ComponentProps<typeof DialogPortalComponent>;

export const DialogBackdrop = DialogBackdropComponent;
export type DialogBackdropProps = ComponentProps<typeof DialogBackdropComponent>;

export const DialogPositioner = DialogPositionerComponent;
export type DialogPositionerProps = ComponentProps<typeof DialogPositionerComponent>;

export const DialogContent = DialogContentComponent;
export type DialogContentProps = ComponentProps<typeof DialogContentComponent>;

export const DialogTitle = DialogTitleComponent;
export type DialogTitleProps = ComponentProps<typeof DialogTitleComponent>;

export const DialogDescription = DialogDescriptionComponent;
export type DialogDescriptionProps = ComponentProps<typeof DialogDescriptionComponent>;

export const DialogClose = DialogCloseComponent;
export type DialogCloseProps = ComponentProps<typeof DialogCloseComponent>;

export const DialogProvider = DialogRoot;
export const Dialog = Object.assign(DialogRoot, { Provider: DialogProvider, Root: DialogRoot, Trigger: DialogTrigger, Portal: DialogPortal, Backdrop: DialogBackdrop, Positioner: DialogPositioner, Content: DialogContent, Title: DialogTitle, Description: DialogDescription, Close: DialogClose });
