import type { ComponentProps } from 'svelte';
import ToggleGroupRootComponent from './Root.svelte';
import ToggleGroupItemComponent from './Item.svelte';

export const ToggleGroupRoot = ToggleGroupRootComponent;
export type ToggleGroupRootProps = ComponentProps<typeof ToggleGroupRootComponent>;

export const ToggleGroupItem = ToggleGroupItemComponent;
export type ToggleGroupItemProps = ComponentProps<typeof ToggleGroupItemComponent>;

export const ToggleGroupProvider = ToggleGroupRoot;
export const ToggleGroup = Object.assign(ToggleGroupRoot, { Provider: ToggleGroupProvider, Root: ToggleGroupRoot, Item: ToggleGroupItem });
