import type { ComponentProps } from 'svelte';
import CarouselRootComponent from './Root.svelte';
import CarouselViewportComponent from './Viewport.svelte';
import CarouselItemComponent from './Item.svelte';
import CarouselPreviousComponent from './Previous.svelte';
import CarouselNextComponent from './Next.svelte';
import CarouselIndicatorGroupComponent from './IndicatorGroup.svelte';
import CarouselIndicatorComponent from './Indicator.svelte';
import CarouselLiveRegionComponent from './LiveRegion.svelte';

export const CarouselRoot = CarouselRootComponent;
export type CarouselRootProps = ComponentProps<typeof CarouselRootComponent>;

export const CarouselViewport = CarouselViewportComponent;
export type CarouselViewportProps = ComponentProps<typeof CarouselViewportComponent>;

export const CarouselItem = CarouselItemComponent;
export type CarouselItemProps = ComponentProps<typeof CarouselItemComponent>;

export const CarouselPrevious = CarouselPreviousComponent;
export type CarouselPreviousProps = ComponentProps<typeof CarouselPreviousComponent>;

export const CarouselNext = CarouselNextComponent;
export type CarouselNextProps = ComponentProps<typeof CarouselNextComponent>;

export const CarouselIndicatorGroup = CarouselIndicatorGroupComponent;
export type CarouselIndicatorGroupProps = ComponentProps<typeof CarouselIndicatorGroupComponent>;

export const CarouselIndicator = CarouselIndicatorComponent;
export type CarouselIndicatorProps = ComponentProps<typeof CarouselIndicatorComponent>;

export const CarouselLiveRegion = CarouselLiveRegionComponent;
export type CarouselLiveRegionProps = ComponentProps<typeof CarouselLiveRegionComponent>;

export const CarouselProvider = CarouselRoot;
export const Carousel = Object.assign(CarouselRoot, { Provider: CarouselProvider, Root: CarouselRoot, Viewport: CarouselViewport, Item: CarouselItem, Previous: CarouselPrevious, Next: CarouselNext, IndicatorGroup: CarouselIndicatorGroup, Indicator: CarouselIndicator, LiveRegion: CarouselLiveRegion });
