import type { ComponentProps } from 'svelte';
import AlertDialogRootComponent from './Root.svelte';
import AlertDialogTriggerComponent from './Trigger.svelte';
import AlertDialogPortalComponent from './Portal.svelte';
import AlertDialogBackdropComponent from './Backdrop.svelte';
import AlertDialogPositionerComponent from './Positioner.svelte';
import AlertDialogContentComponent from './Content.svelte';
import AlertDialogTitleComponent from './Title.svelte';
import AlertDialogDescriptionComponent from './Description.svelte';
import AlertDialogCancelComponent from './Cancel.svelte';
import AlertDialogActionComponent from './Action.svelte';
import AlertDialogCloseComponent from './Close.svelte';

export const AlertDialogRoot = AlertDialogRootComponent;
export type AlertDialogRootProps = ComponentProps<typeof AlertDialogRootComponent>;

export const AlertDialogTrigger = AlertDialogTriggerComponent;
export type AlertDialogTriggerProps = ComponentProps<typeof AlertDialogTriggerComponent>;

export const AlertDialogPortal = AlertDialogPortalComponent;
export type AlertDialogPortalProps = ComponentProps<typeof AlertDialogPortalComponent>;

export const AlertDialogBackdrop = AlertDialogBackdropComponent;
export type AlertDialogBackdropProps = ComponentProps<typeof AlertDialogBackdropComponent>;

export const AlertDialogPositioner = AlertDialogPositionerComponent;
export type AlertDialogPositionerProps = ComponentProps<typeof AlertDialogPositionerComponent>;

export const AlertDialogContent = AlertDialogContentComponent;
export type AlertDialogContentProps = ComponentProps<typeof AlertDialogContentComponent>;

export const AlertDialogTitle = AlertDialogTitleComponent;
export type AlertDialogTitleProps = ComponentProps<typeof AlertDialogTitleComponent>;

export const AlertDialogDescription = AlertDialogDescriptionComponent;
export type AlertDialogDescriptionProps = ComponentProps<typeof AlertDialogDescriptionComponent>;

export const AlertDialogCancel = AlertDialogCancelComponent;
export type AlertDialogCancelProps = ComponentProps<typeof AlertDialogCancelComponent>;

export const AlertDialogAction = AlertDialogActionComponent;
export type AlertDialogActionProps = ComponentProps<typeof AlertDialogActionComponent>;

export const AlertDialogClose = AlertDialogCloseComponent;
export type AlertDialogCloseProps = ComponentProps<typeof AlertDialogCloseComponent>;

export const AlertDialogProvider = AlertDialogRoot;
export const AlertDialog = Object.assign(AlertDialogRoot, { Provider: AlertDialogProvider, Root: AlertDialogRoot, Trigger: AlertDialogTrigger, Portal: AlertDialogPortal, Backdrop: AlertDialogBackdrop, Positioner: AlertDialogPositioner, Content: AlertDialogContent, Title: AlertDialogTitle, Description: AlertDialogDescription, Cancel: AlertDialogCancel, Action: AlertDialogAction, Close: AlertDialogClose });
