import type { ComponentProps } from 'svelte';
import MarqueeRootComponent from './Root.svelte';
import MarqueeViewportComponent from './Viewport.svelte';
import MarqueeTrackComponent from './Track.svelte';
import MarqueeItemComponent from './Item.svelte';

export const MarqueeRoot = MarqueeRootComponent;
export type MarqueeRootProps = ComponentProps<typeof MarqueeRootComponent>;

export const MarqueeViewport = MarqueeViewportComponent;
export type MarqueeViewportProps = ComponentProps<typeof MarqueeViewportComponent>;

export const MarqueeTrack = MarqueeTrackComponent;
export type MarqueeTrackProps = ComponentProps<typeof MarqueeTrackComponent>;

export const MarqueeItem = MarqueeItemComponent;
export type MarqueeItemProps = ComponentProps<typeof MarqueeItemComponent>;

export const MarqueeProvider = MarqueeRoot;
export const Marquee = Object.assign(MarqueeRoot, { Provider: MarqueeProvider, Root: MarqueeRoot, Viewport: MarqueeViewport, Track: MarqueeTrack, Item: MarqueeItem });
