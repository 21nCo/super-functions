import type { ComponentProps } from 'svelte';
import AvatarRootComponent from './Root.svelte';
import AvatarImageComponent from './Image.svelte';
import AvatarFallbackComponent from './Fallback.svelte';

export const AvatarRoot = AvatarRootComponent;
export type AvatarRootProps = ComponentProps<typeof AvatarRootComponent>;

export const AvatarImage = AvatarImageComponent;
export type AvatarImageProps = ComponentProps<typeof AvatarImageComponent>;

export const AvatarFallback = AvatarFallbackComponent;
export type AvatarFallbackProps = ComponentProps<typeof AvatarFallbackComponent>;

export const AvatarProvider = AvatarRoot;
export const Avatar = Object.assign(AvatarRoot, { Provider: AvatarProvider, Root: AvatarRoot, Image: AvatarImage, Fallback: AvatarFallback });
