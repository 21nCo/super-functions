import type { ComponentProps } from 'svelte';
import NavigationMenuRootComponent from './Root.svelte';
import NavigationMenuListComponent from './List.svelte';
import NavigationMenuItemComponent from './Item.svelte';
import NavigationMenuTriggerComponent from './Trigger.svelte';
import NavigationMenuContentComponent from './Content.svelte';
import NavigationMenuLinkComponent from './Link.svelte';
import NavigationMenuViewportComponent from './Viewport.svelte';
import NavigationMenuIndicatorComponent from './Indicator.svelte';

export const NavigationMenuRoot = NavigationMenuRootComponent;
export type NavigationMenuRootProps = ComponentProps<typeof NavigationMenuRootComponent>;

export const NavigationMenuList = NavigationMenuListComponent;
export type NavigationMenuListProps = ComponentProps<typeof NavigationMenuListComponent>;

export const NavigationMenuItem = NavigationMenuItemComponent;
export type NavigationMenuItemProps = ComponentProps<typeof NavigationMenuItemComponent>;

export const NavigationMenuTrigger = NavigationMenuTriggerComponent;
export type NavigationMenuTriggerProps = ComponentProps<typeof NavigationMenuTriggerComponent>;

export const NavigationMenuContent = NavigationMenuContentComponent;
export type NavigationMenuContentProps = ComponentProps<typeof NavigationMenuContentComponent>;

export const NavigationMenuLink = NavigationMenuLinkComponent;
export type NavigationMenuLinkProps = ComponentProps<typeof NavigationMenuLinkComponent>;

export const NavigationMenuViewport = NavigationMenuViewportComponent;
export type NavigationMenuViewportProps = ComponentProps<typeof NavigationMenuViewportComponent>;

export const NavigationMenuIndicator = NavigationMenuIndicatorComponent;
export type NavigationMenuIndicatorProps = ComponentProps<typeof NavigationMenuIndicatorComponent>;

export const NavigationMenuProvider = NavigationMenuRoot;
export const NavigationMenu = Object.assign(NavigationMenuRoot, { Provider: NavigationMenuProvider, Root: NavigationMenuRoot, List: NavigationMenuList, Item: NavigationMenuItem, Trigger: NavigationMenuTrigger, Content: NavigationMenuContent, Link: NavigationMenuLink, Viewport: NavigationMenuViewport, Indicator: NavigationMenuIndicator });
