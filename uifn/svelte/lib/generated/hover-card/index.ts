import type { ComponentProps } from 'svelte';
import HoverCardRootComponent from './Root.svelte';
import HoverCardTriggerComponent from './Trigger.svelte';
import HoverCardPositionerComponent from './Positioner.svelte';
import HoverCardContentComponent from './Content.svelte';
import HoverCardArrowComponent from './Arrow.svelte';

export const HoverCardRoot = HoverCardRootComponent;
export type HoverCardRootProps = ComponentProps<typeof HoverCardRootComponent>;

export const HoverCardTrigger = HoverCardTriggerComponent;
export type HoverCardTriggerProps = ComponentProps<typeof HoverCardTriggerComponent>;

export const HoverCardPositioner = HoverCardPositionerComponent;
export type HoverCardPositionerProps = ComponentProps<typeof HoverCardPositionerComponent>;

export const HoverCardContent = HoverCardContentComponent;
export type HoverCardContentProps = ComponentProps<typeof HoverCardContentComponent>;

export const HoverCardArrow = HoverCardArrowComponent;
export type HoverCardArrowProps = ComponentProps<typeof HoverCardArrowComponent>;

export const HoverCardProvider = HoverCardRoot;
export const HoverCard = Object.assign(HoverCardRoot, { Provider: HoverCardProvider, Root: HoverCardRoot, Trigger: HoverCardTrigger, Positioner: HoverCardPositioner, Content: HoverCardContent, Arrow: HoverCardArrow });
