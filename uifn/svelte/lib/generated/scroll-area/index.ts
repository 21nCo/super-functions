import type { ComponentProps } from 'svelte';
import ScrollAreaRootComponent from './Root.svelte';
import ScrollAreaViewportComponent from './Viewport.svelte';
import ScrollAreaContentComponent from './Content.svelte';
import ScrollAreaScrollbarComponent from './Scrollbar.svelte';
import ScrollAreaThumbComponent from './Thumb.svelte';
import ScrollAreaCornerComponent from './Corner.svelte';

export const ScrollAreaRoot = ScrollAreaRootComponent;
export type ScrollAreaRootProps = ComponentProps<typeof ScrollAreaRootComponent>;

export const ScrollAreaViewport = ScrollAreaViewportComponent;
export type ScrollAreaViewportProps = ComponentProps<typeof ScrollAreaViewportComponent>;

export const ScrollAreaContent = ScrollAreaContentComponent;
export type ScrollAreaContentProps = ComponentProps<typeof ScrollAreaContentComponent>;

export const ScrollAreaScrollbar = ScrollAreaScrollbarComponent;
export type ScrollAreaScrollbarProps = ComponentProps<typeof ScrollAreaScrollbarComponent>;

export const ScrollAreaThumb = ScrollAreaThumbComponent;
export type ScrollAreaThumbProps = ComponentProps<typeof ScrollAreaThumbComponent>;

export const ScrollAreaCorner = ScrollAreaCornerComponent;
export type ScrollAreaCornerProps = ComponentProps<typeof ScrollAreaCornerComponent>;

export const ScrollAreaProvider = ScrollAreaRoot;
export const ScrollArea = Object.assign(ScrollAreaRoot, { Provider: ScrollAreaProvider, Root: ScrollAreaRoot, Viewport: ScrollAreaViewport, Content: ScrollAreaContent, Scrollbar: ScrollAreaScrollbar, Thumb: ScrollAreaThumb, Corner: ScrollAreaCorner });
