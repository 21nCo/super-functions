import type { ComponentProps } from 'svelte';
import SeparatorRootComponent from './Root.svelte';

export const SeparatorRoot = SeparatorRootComponent;
export type SeparatorRootProps = ComponentProps<typeof SeparatorRootComponent>;

export const SeparatorProvider = SeparatorRoot;
export const Separator = Object.assign(SeparatorRoot, { Provider: SeparatorProvider, Root: SeparatorRoot });
