import type { ComponentProps } from 'svelte';
import PopoverRootComponent from './Root.svelte';
import PopoverAnchorComponent from './Anchor.svelte';
import PopoverTriggerComponent from './Trigger.svelte';
import PopoverPositionerComponent from './Positioner.svelte';
import PopoverContentComponent from './Content.svelte';
import PopoverTitleComponent from './Title.svelte';
import PopoverDescriptionComponent from './Description.svelte';
import PopoverArrowComponent from './Arrow.svelte';
import PopoverCloseComponent from './Close.svelte';

export const PopoverRoot = PopoverRootComponent;
export type PopoverRootProps = ComponentProps<typeof PopoverRootComponent>;

export const PopoverAnchor = PopoverAnchorComponent;
export type PopoverAnchorProps = ComponentProps<typeof PopoverAnchorComponent>;

export const PopoverTrigger = PopoverTriggerComponent;
export type PopoverTriggerProps = ComponentProps<typeof PopoverTriggerComponent>;

export const PopoverPositioner = PopoverPositionerComponent;
export type PopoverPositionerProps = ComponentProps<typeof PopoverPositionerComponent>;

export const PopoverContent = PopoverContentComponent;
export type PopoverContentProps = ComponentProps<typeof PopoverContentComponent>;

export const PopoverTitle = PopoverTitleComponent;
export type PopoverTitleProps = ComponentProps<typeof PopoverTitleComponent>;

export const PopoverDescription = PopoverDescriptionComponent;
export type PopoverDescriptionProps = ComponentProps<typeof PopoverDescriptionComponent>;

export const PopoverArrow = PopoverArrowComponent;
export type PopoverArrowProps = ComponentProps<typeof PopoverArrowComponent>;

export const PopoverClose = PopoverCloseComponent;
export type PopoverCloseProps = ComponentProps<typeof PopoverCloseComponent>;

export const PopoverProvider = PopoverRoot;
export const Popover = Object.assign(PopoverRoot, { Provider: PopoverProvider, Root: PopoverRoot, Anchor: PopoverAnchor, Trigger: PopoverTrigger, Positioner: PopoverPositioner, Content: PopoverContent, Title: PopoverTitle, Description: PopoverDescription, Arrow: PopoverArrow, Close: PopoverClose });
