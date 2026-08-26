import { createCarouselController, type CarouselProps } from '@uifn/core/primitives/carousel';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CarouselDefinition: SveltePrimitiveDefinition<CarouselProps> = {
  name: 'Carousel',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["index","defaultIndex","itemCount","loop","orientation","autoplayDelay","dir"],
  contextKey: Symbol('uifn.Carousel'),
  createController: createCarouselController as never,
};
