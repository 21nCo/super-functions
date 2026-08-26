import type { ComponentProps } from 'svelte';
import DrawerRootComponent from './Root.svelte';
import DrawerTriggerComponent from './Trigger.svelte';
import DrawerPortalComponent from './Portal.svelte';
import DrawerBackdropComponent from './Backdrop.svelte';
import DrawerPositionerComponent from './Positioner.svelte';
import DrawerContentComponent from './Content.svelte';
import DrawerHandleComponent from './Handle.svelte';
import DrawerTitleComponent from './Title.svelte';
import DrawerDescriptionComponent from './Description.svelte';
import DrawerCloseComponent from './Close.svelte';

export const DrawerRoot = DrawerRootComponent;
export type DrawerRootProps = ComponentProps<typeof DrawerRootComponent>;

export const DrawerTrigger = DrawerTriggerComponent;
export type DrawerTriggerProps = ComponentProps<typeof DrawerTriggerComponent>;

export const DrawerPortal = DrawerPortalComponent;
export type DrawerPortalProps = ComponentProps<typeof DrawerPortalComponent>;

export const DrawerBackdrop = DrawerBackdropComponent;
export type DrawerBackdropProps = ComponentProps<typeof DrawerBackdropComponent>;

export const DrawerPositioner = DrawerPositionerComponent;
export type DrawerPositionerProps = ComponentProps<typeof DrawerPositionerComponent>;

export const DrawerContent = DrawerContentComponent;
export type DrawerContentProps = ComponentProps<typeof DrawerContentComponent>;

export const DrawerHandle = DrawerHandleComponent;
export type DrawerHandleProps = ComponentProps<typeof DrawerHandleComponent>;

export const DrawerTitle = DrawerTitleComponent;
export type DrawerTitleProps = ComponentProps<typeof DrawerTitleComponent>;

export const DrawerDescription = DrawerDescriptionComponent;
export type DrawerDescriptionProps = ComponentProps<typeof DrawerDescriptionComponent>;

export const DrawerClose = DrawerCloseComponent;
export type DrawerCloseProps = ComponentProps<typeof DrawerCloseComponent>;

export const DrawerProvider = DrawerRoot;
export const Drawer = Object.assign(DrawerRoot, { Provider: DrawerProvider, Root: DrawerRoot, Trigger: DrawerTrigger, Portal: DrawerPortal, Backdrop: DrawerBackdrop, Positioner: DrawerPositioner, Content: DrawerContent, Handle: DrawerHandle, Title: DrawerTitle, Description: DrawerDescription, Close: DrawerClose });
