import type { ComponentProps } from 'svelte';
import ContextMenuRootComponent from './Root.svelte';
import ContextMenuTriggerComponent from './Trigger.svelte';
import ContextMenuPositionerComponent from './Positioner.svelte';
import ContextMenuContentComponent from './Content.svelte';
import ContextMenuItemComponent from './Item.svelte';
import ContextMenuItemIndicatorComponent from './ItemIndicator.svelte';
import ContextMenuSeparatorComponent from './Separator.svelte';
import ContextMenuGroupComponent from './Group.svelte';
import ContextMenuGroupLabelComponent from './GroupLabel.svelte';
import ContextMenuSubmenuTriggerComponent from './SubmenuTrigger.svelte';
import ContextMenuSubmenuContentComponent from './SubmenuContent.svelte';

export const ContextMenuRoot = ContextMenuRootComponent;
export type ContextMenuRootProps = ComponentProps<typeof ContextMenuRootComponent>;

export const ContextMenuTrigger = ContextMenuTriggerComponent;
export type ContextMenuTriggerProps = ComponentProps<typeof ContextMenuTriggerComponent>;

export const ContextMenuPositioner = ContextMenuPositionerComponent;
export type ContextMenuPositionerProps = ComponentProps<typeof ContextMenuPositionerComponent>;

export const ContextMenuContent = ContextMenuContentComponent;
export type ContextMenuContentProps = ComponentProps<typeof ContextMenuContentComponent>;

export const ContextMenuItem = ContextMenuItemComponent;
export type ContextMenuItemProps = ComponentProps<typeof ContextMenuItemComponent>;

export const ContextMenuItemIndicator = ContextMenuItemIndicatorComponent;
export type ContextMenuItemIndicatorProps = ComponentProps<typeof ContextMenuItemIndicatorComponent>;

export const ContextMenuSeparator = ContextMenuSeparatorComponent;
export type ContextMenuSeparatorProps = ComponentProps<typeof ContextMenuSeparatorComponent>;

export const ContextMenuGroup = ContextMenuGroupComponent;
export type ContextMenuGroupProps = ComponentProps<typeof ContextMenuGroupComponent>;

export const ContextMenuGroupLabel = ContextMenuGroupLabelComponent;
export type ContextMenuGroupLabelProps = ComponentProps<typeof ContextMenuGroupLabelComponent>;

export const ContextMenuSubmenuTrigger = ContextMenuSubmenuTriggerComponent;
export type ContextMenuSubmenuTriggerProps = ComponentProps<typeof ContextMenuSubmenuTriggerComponent>;

export const ContextMenuSubmenuContent = ContextMenuSubmenuContentComponent;
export type ContextMenuSubmenuContentProps = ComponentProps<typeof ContextMenuSubmenuContentComponent>;

export const ContextMenuProvider = ContextMenuRoot;
export const ContextMenu = Object.assign(ContextMenuRoot, { Provider: ContextMenuProvider, Root: ContextMenuRoot, Trigger: ContextMenuTrigger, Positioner: ContextMenuPositioner, Content: ContextMenuContent, Item: ContextMenuItem, ItemIndicator: ContextMenuItemIndicator, Separator: ContextMenuSeparator, Group: ContextMenuGroup, GroupLabel: ContextMenuGroupLabel, SubmenuTrigger: ContextMenuSubmenuTrigger, SubmenuContent: ContextMenuSubmenuContent });
