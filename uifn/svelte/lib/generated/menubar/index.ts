import type { ComponentProps } from 'svelte';
import MenubarRootComponent from './Root.svelte';
import MenubarMenuComponent from './Menu.svelte';
import MenubarTriggerComponent from './Trigger.svelte';
import MenubarContentComponent from './Content.svelte';
import MenubarItemComponent from './Item.svelte';
import MenubarSubmenuTriggerComponent from './SubmenuTrigger.svelte';
import MenubarSubmenuContentComponent from './SubmenuContent.svelte';

export const MenubarRoot = MenubarRootComponent;
export type MenubarRootProps = ComponentProps<typeof MenubarRootComponent>;

export const MenubarMenu = MenubarMenuComponent;
export type MenubarMenuProps = ComponentProps<typeof MenubarMenuComponent>;

export const MenubarTrigger = MenubarTriggerComponent;
export type MenubarTriggerProps = ComponentProps<typeof MenubarTriggerComponent>;

export const MenubarContent = MenubarContentComponent;
export type MenubarContentProps = ComponentProps<typeof MenubarContentComponent>;

export const MenubarItem = MenubarItemComponent;
export type MenubarItemProps = ComponentProps<typeof MenubarItemComponent>;

export const MenubarSubmenuTrigger = MenubarSubmenuTriggerComponent;
export type MenubarSubmenuTriggerProps = ComponentProps<typeof MenubarSubmenuTriggerComponent>;

export const MenubarSubmenuContent = MenubarSubmenuContentComponent;
export type MenubarSubmenuContentProps = ComponentProps<typeof MenubarSubmenuContentComponent>;

export const MenubarProvider = MenubarRoot;
export const Menubar = Object.assign(MenubarRoot, { Provider: MenubarProvider, Root: MenubarRoot, Menu: MenubarMenu, Trigger: MenubarTrigger, Content: MenubarContent, Item: MenubarItem, SubmenuTrigger: MenubarSubmenuTrigger, SubmenuContent: MenubarSubmenuContent });
