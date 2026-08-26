import type { ComponentProps } from 'svelte';
import TextareaRootComponent from './Root.svelte';

export const TextareaRoot = TextareaRootComponent;
export type TextareaRootProps = ComponentProps<typeof TextareaRootComponent>;

export const TextareaProvider = TextareaRoot;
export const Textarea = Object.assign(TextareaRoot, { Provider: TextareaProvider, Root: TextareaRoot });
