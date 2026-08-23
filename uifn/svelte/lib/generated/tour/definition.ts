import { createTourController, type TourProps } from '@uifn/core/primitives/tour';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TourDefinition: SveltePrimitiveDefinition<TourProps> = {
  name: 'Tour',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","step","defaultStep","steps","modal"],
  contextKey: Symbol('uifn.Tour'),
  createController: createTourController as never,
};
