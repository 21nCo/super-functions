import type { ComponentProps } from 'svelte';
import InputRootComponent from './Root.svelte';

export const InputRoot = InputRootComponent;
export type InputRootProps = ComponentProps<typeof InputRootComponent>;

export const InputProvider = InputRoot;
export const Input = Object.assign(InputRoot, { Provider: InputProvider, Root: InputRoot });
