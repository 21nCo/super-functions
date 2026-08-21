import type { ComponentProps } from 'svelte';
import BadgeRootComponent from './Root.svelte';

export const BadgeRoot = BadgeRootComponent;
export type BadgeRootProps = ComponentProps<typeof BadgeRootComponent>;

export const BadgeProvider = BadgeRoot;
export const Badge = Object.assign(BadgeRoot, { Provider: BadgeProvider, Root: BadgeRoot });
