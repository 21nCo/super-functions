import type { ComponentProps } from 'svelte';
import TabsRootComponent from './Root.svelte';
import TabsListComponent from './List.svelte';
import TabsTriggerComponent from './Trigger.svelte';
import TabsContentComponent from './Content.svelte';
import TabsIndicatorComponent from './Indicator.svelte';

export const TabsRoot = TabsRootComponent;
export type TabsRootProps = ComponentProps<typeof TabsRootComponent>;

export const TabsList = TabsListComponent;
export type TabsListProps = ComponentProps<typeof TabsListComponent>;

export const TabsTrigger = TabsTriggerComponent;
export type TabsTriggerProps = ComponentProps<typeof TabsTriggerComponent>;

export const TabsContent = TabsContentComponent;
export type TabsContentProps = ComponentProps<typeof TabsContentComponent>;

export const TabsIndicator = TabsIndicatorComponent;
export type TabsIndicatorProps = ComponentProps<typeof TabsIndicatorComponent>;

export const TabsProvider = TabsRoot;
export const Tabs = Object.assign(TabsRoot, { Provider: TabsProvider, Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Content: TabsContent, Indicator: TabsIndicator });
