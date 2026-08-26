import type { ComponentProps } from 'svelte';
import AccordionRootComponent from './Root.svelte';
import AccordionItemComponent from './Item.svelte';
import AccordionHeaderComponent from './Header.svelte';
import AccordionTriggerComponent from './Trigger.svelte';
import AccordionContentComponent from './Content.svelte';
import AccordionIndicatorComponent from './Indicator.svelte';

export const AccordionRoot = AccordionRootComponent;
export type AccordionRootProps = ComponentProps<typeof AccordionRootComponent>;

export const AccordionItem = AccordionItemComponent;
export type AccordionItemProps = ComponentProps<typeof AccordionItemComponent>;

export const AccordionHeader = AccordionHeaderComponent;
export type AccordionHeaderProps = ComponentProps<typeof AccordionHeaderComponent>;

export const AccordionTrigger = AccordionTriggerComponent;
export type AccordionTriggerProps = ComponentProps<typeof AccordionTriggerComponent>;

export const AccordionContent = AccordionContentComponent;
export type AccordionContentProps = ComponentProps<typeof AccordionContentComponent>;

export const AccordionIndicator = AccordionIndicatorComponent;
export type AccordionIndicatorProps = ComponentProps<typeof AccordionIndicatorComponent>;

export const AccordionProvider = AccordionRoot;
export const Accordion = Object.assign(AccordionRoot, { Provider: AccordionProvider, Root: AccordionRoot, Item: AccordionItem, Header: AccordionHeader, Trigger: AccordionTrigger, Content: AccordionContent, Indicator: AccordionIndicator });
