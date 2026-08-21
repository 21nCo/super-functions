import type { ComponentProps } from 'svelte';
import CollapsibleRootComponent from './Root.svelte';
import CollapsibleTriggerComponent from './Trigger.svelte';
import CollapsibleContentComponent from './Content.svelte';

export const CollapsibleRoot = CollapsibleRootComponent;
export type CollapsibleRootProps = ComponentProps<typeof CollapsibleRootComponent>;

export const CollapsibleTrigger = CollapsibleTriggerComponent;
export type CollapsibleTriggerProps = ComponentProps<typeof CollapsibleTriggerComponent>;

export const CollapsibleContent = CollapsibleContentComponent;
export type CollapsibleContentProps = ComponentProps<typeof CollapsibleContentComponent>;

export const CollapsibleProvider = CollapsibleRoot;
export const Collapsible = Object.assign(CollapsibleRoot, { Provider: CollapsibleProvider, Root: CollapsibleRoot, Trigger: CollapsibleTrigger, Content: CollapsibleContent });
