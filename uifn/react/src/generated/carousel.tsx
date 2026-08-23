'use client';

import * as React from 'react';
import { createCarouselController, type CarouselProps, type CarouselController } from '@uifn/core/primitives/carousel';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const CarouselContext = React.createContext<ReactPrimitiveBridge<CarouselProps> | null>(null);
const CarouselDefinition: ReactPrimitiveDefinition<CarouselProps> = {
  name: 'Carousel',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["index","defaultIndex","itemCount","loop","orientation","autoplayDelay"],
  context: CarouselContext,
  createController: createCarouselController as never,
};

export type CarouselRootProps = ReactPrimitiveRootProps<CarouselProps, 'section'>;
export const CarouselRoot = React.forwardRef<React.ElementRef<'section'>, CarouselRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CarouselDefinition} element="section" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselRoot.displayName = 'CarouselRoot';

export type CarouselViewportProps = ReactPrimitivePartProps<CarouselController['parts']['viewport'], 'div', false>;
export const CarouselViewport = React.forwardRef<React.ElementRef<'div'>, CarouselViewportProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="viewport" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselViewport.displayName = 'CarouselViewport';

export type CarouselItemProps = ReactPrimitivePartProps<CarouselController['parts']['item'], 'div', true>;
export const CarouselItem = React.forwardRef<React.ElementRef<'div'>, CarouselItemProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselItem.displayName = 'CarouselItem';

export type CarouselPreviousProps = ReactPrimitivePartProps<CarouselController['parts']['previous'], 'button', false>;
export const CarouselPrevious = React.forwardRef<React.ElementRef<'button'>, CarouselPreviousProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="previous" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselPrevious.displayName = 'CarouselPrevious';

export type CarouselNextProps = ReactPrimitivePartProps<CarouselController['parts']['next'], 'button', false>;
export const CarouselNext = React.forwardRef<React.ElementRef<'button'>, CarouselNextProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="next" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselNext.displayName = 'CarouselNext';

export type CarouselIndicatorGroupProps = ReactPrimitivePartProps<CarouselController['parts']['indicatorGroup'], 'div', false>;
export const CarouselIndicatorGroup = React.forwardRef<React.ElementRef<'div'>, CarouselIndicatorGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="indicatorGroup" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselIndicatorGroup.displayName = 'CarouselIndicatorGroup';

export type CarouselIndicatorProps = ReactPrimitivePartProps<CarouselController['parts']['indicator'], 'button', true>;
export const CarouselIndicator = React.forwardRef<React.ElementRef<'button'>, CarouselIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="indicator" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselIndicator.displayName = 'CarouselIndicator';

export type CarouselLiveRegionProps = ReactPrimitivePartProps<CarouselController['parts']['liveRegion'], 'div', false>;
export const CarouselLiveRegion = React.forwardRef<React.ElementRef<'div'>, CarouselLiveRegionProps>((props, ref) => (
  <ReactPrimitivePart definition={CarouselDefinition as never} part="liveRegion" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CarouselLiveRegion.displayName = 'CarouselLiveRegion';

export const CarouselProvider = CarouselRoot;
export function useCarousel(inputs: CarouselProps): ReactPrimitiveHookResult<CarouselController['state'], CarouselController['actions']> {
  return useReactPrimitive(CarouselDefinition, inputs) as ReactPrimitiveHookResult<CarouselController['state'], CarouselController['actions']>;
}
export const Carousel = Object.assign(CarouselRoot, { Provider: CarouselProvider, Root: CarouselRoot, Viewport: CarouselViewport, Item: CarouselItem, Previous: CarouselPrevious, Next: CarouselNext, IndicatorGroup: CarouselIndicatorGroup, Indicator: CarouselIndicator, LiveRegion: CarouselLiveRegion });
