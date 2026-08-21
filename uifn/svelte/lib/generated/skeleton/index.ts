import type { ComponentProps } from 'svelte';
import SkeletonRootComponent from './Root.svelte';

export const SkeletonRoot = SkeletonRootComponent;
export type SkeletonRootProps = ComponentProps<typeof SkeletonRootComponent>;

export const SkeletonProvider = SkeletonRoot;
export const Skeleton = Object.assign(SkeletonRoot, { Provider: SkeletonProvider, Root: SkeletonRoot });
