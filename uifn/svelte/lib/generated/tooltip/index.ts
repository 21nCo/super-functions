import type { ComponentProps } from 'svelte';
import TooltipRootComponent from './Root.svelte';
import TooltipTriggerComponent from './Trigger.svelte';
import TooltipPositionerComponent from './Positioner.svelte';
import TooltipContentComponent from './Content.svelte';
import TooltipArrowComponent from './Arrow.svelte';

export const TooltipRoot = TooltipRootComponent;
export type TooltipRootProps = ComponentProps<typeof TooltipRootComponent>;

export const TooltipTrigger = TooltipTriggerComponent;
export type TooltipTriggerProps = ComponentProps<typeof TooltipTriggerComponent>;

export const TooltipPositioner = TooltipPositionerComponent;
export type TooltipPositionerProps = ComponentProps<typeof TooltipPositionerComponent>;

export const TooltipContent = TooltipContentComponent;
export type TooltipContentProps = ComponentProps<typeof TooltipContentComponent>;

export const TooltipArrow = TooltipArrowComponent;
export type TooltipArrowProps = ComponentProps<typeof TooltipArrowComponent>;

export const TooltipProvider = TooltipRoot;
export const Tooltip = Object.assign(TooltipRoot, { Provider: TooltipProvider, Root: TooltipRoot, Trigger: TooltipTrigger, Positioner: TooltipPositioner, Content: TooltipContent, Arrow: TooltipArrow });
