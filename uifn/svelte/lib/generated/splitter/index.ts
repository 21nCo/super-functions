import type { ComponentProps } from 'svelte';
import SplitterRootComponent from './Root.svelte';
import SplitterPanelComponent from './Panel.svelte';
import SplitterResizeTriggerComponent from './ResizeTrigger.svelte';
import SplitterResizeHandleComponent from './ResizeHandle.svelte';

export const SplitterRoot = SplitterRootComponent;
export type SplitterRootProps = ComponentProps<typeof SplitterRootComponent>;

export const SplitterPanel = SplitterPanelComponent;
export type SplitterPanelProps = ComponentProps<typeof SplitterPanelComponent>;

export const SplitterResizeTrigger = SplitterResizeTriggerComponent;
export type SplitterResizeTriggerProps = ComponentProps<typeof SplitterResizeTriggerComponent>;

export const SplitterResizeHandle = SplitterResizeHandleComponent;
export type SplitterResizeHandleProps = ComponentProps<typeof SplitterResizeHandleComponent>;

export const SplitterProvider = SplitterRoot;
export const Splitter = Object.assign(SplitterRoot, { Provider: SplitterProvider, Root: SplitterRoot, Panel: SplitterPanel, ResizeTrigger: SplitterResizeTrigger, ResizeHandle: SplitterResizeHandle });
