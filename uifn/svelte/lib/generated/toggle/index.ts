import type { ComponentProps } from 'svelte';
import ToggleRootComponent from './Root.svelte';

export const ToggleRoot = ToggleRootComponent;
export type ToggleRootProps = ComponentProps<typeof ToggleRootComponent>;

export const ToggleProvider = ToggleRoot;
export const Toggle = Object.assign(ToggleRoot, { Provider: ToggleProvider, Root: ToggleRoot });
