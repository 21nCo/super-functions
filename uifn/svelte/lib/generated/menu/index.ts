import type { ComponentProps } from 'svelte';
import MenuRootComponent from './Root.svelte';
import MenuTriggerComponent from './Trigger.svelte';
import MenuPositionerComponent from './Positioner.svelte';
import MenuContentComponent from './Content.svelte';
import MenuItemComponent from './Item.svelte';
import MenuItemIndicatorComponent from './ItemIndicator.svelte';
import MenuSeparatorComponent from './Separator.svelte';
import MenuGroupComponent from './Group.svelte';
import MenuGroupLabelComponent from './GroupLabel.svelte';
import MenuSubmenuTriggerComponent from './SubmenuTrigger.svelte';
import MenuSubmenuContentComponent from './SubmenuContent.svelte';

export const MenuRoot = MenuRootComponent;
export type MenuRootProps = ComponentProps<typeof MenuRootComponent>;

export const MenuTrigger = MenuTriggerComponent;
export type MenuTriggerProps = ComponentProps<typeof MenuTriggerComponent>;

export const MenuPositioner = MenuPositionerComponent;
export type MenuPositionerProps = ComponentProps<typeof MenuPositionerComponent>;

export const MenuContent = MenuContentComponent;
export type MenuContentProps = ComponentProps<typeof MenuContentComponent>;

export const MenuItem = MenuItemComponent;
export type MenuItemProps = ComponentProps<typeof MenuItemComponent>;

export const MenuItemIndicator = MenuItemIndicatorComponent;
export type MenuItemIndicatorProps = ComponentProps<typeof MenuItemIndicatorComponent>;

export const MenuSeparator = MenuSeparatorComponent;
export type MenuSeparatorProps = ComponentProps<typeof MenuSeparatorComponent>;

export const MenuGroup = MenuGroupComponent;
export type MenuGroupProps = ComponentProps<typeof MenuGroupComponent>;

export const MenuGroupLabel = MenuGroupLabelComponent;
export type MenuGroupLabelProps = ComponentProps<typeof MenuGroupLabelComponent>;

export const MenuSubmenuTrigger = MenuSubmenuTriggerComponent;
export type MenuSubmenuTriggerProps = ComponentProps<typeof MenuSubmenuTriggerComponent>;

export const MenuSubmenuContent = MenuSubmenuContentComponent;
export type MenuSubmenuContentProps = ComponentProps<typeof MenuSubmenuContentComponent>;

export const MenuProvider = MenuRoot;
export const Menu = Object.assign(MenuRoot, { Provider: MenuProvider, Root: MenuRoot, Trigger: MenuTrigger, Positioner: MenuPositioner, Content: MenuContent, Item: MenuItem, ItemIndicator: MenuItemIndicator, Separator: MenuSeparator, Group: MenuGroup, GroupLabel: MenuGroupLabel, SubmenuTrigger: MenuSubmenuTrigger, SubmenuContent: MenuSubmenuContent });
