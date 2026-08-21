import type { ComponentProps } from 'svelte';
import ClipboardRootComponent from './Root.svelte';
import ClipboardTriggerComponent from './Trigger.svelte';
import ClipboardStatusComponent from './Status.svelte';

export const ClipboardRoot = ClipboardRootComponent;
export type ClipboardRootProps = ComponentProps<typeof ClipboardRootComponent>;

export const ClipboardTrigger = ClipboardTriggerComponent;
export type ClipboardTriggerProps = ComponentProps<typeof ClipboardTriggerComponent>;

export const ClipboardStatus = ClipboardStatusComponent;
export type ClipboardStatusProps = ComponentProps<typeof ClipboardStatusComponent>;

export const ClipboardProvider = ClipboardRoot;
export const Clipboard = Object.assign(ClipboardRoot, { Provider: ClipboardProvider, Root: ClipboardRoot, Trigger: ClipboardTrigger, Status: ClipboardStatus });
