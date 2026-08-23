import type { ComponentProps } from 'svelte';
import ToolbarRootComponent from './Root.svelte';
import ToolbarButtonComponent from './Button.svelte';
import ToolbarLinkComponent from './Link.svelte';
import ToolbarToggleGroupComponent from './ToggleGroup.svelte';
import ToolbarSeparatorComponent from './Separator.svelte';

export const ToolbarRoot = ToolbarRootComponent;
export type ToolbarRootProps = ComponentProps<typeof ToolbarRootComponent>;

export const ToolbarButton = ToolbarButtonComponent;
export type ToolbarButtonProps = ComponentProps<typeof ToolbarButtonComponent>;

export const ToolbarLink = ToolbarLinkComponent;
export type ToolbarLinkProps = ComponentProps<typeof ToolbarLinkComponent>;

export const ToolbarToggleGroup = ToolbarToggleGroupComponent;
export type ToolbarToggleGroupProps = ComponentProps<typeof ToolbarToggleGroupComponent>;

export const ToolbarSeparator = ToolbarSeparatorComponent;
export type ToolbarSeparatorProps = ComponentProps<typeof ToolbarSeparatorComponent>;

export const ToolbarProvider = ToolbarRoot;
export const Toolbar = Object.assign(ToolbarRoot, { Provider: ToolbarProvider, Root: ToolbarRoot, Button: ToolbarButton, Link: ToolbarLink, ToggleGroup: ToolbarToggleGroup, Separator: ToolbarSeparator });
