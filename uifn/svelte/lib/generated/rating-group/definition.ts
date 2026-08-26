import { createRatingGroupController, type RatingGroupProps } from '@uifn/core/primitives/rating-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const RatingGroupDefinition: SveltePrimitiveDefinition<RatingGroupProps> = {
  name: 'RatingGroup',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","count","allowHalf","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.RatingGroup'),
  createController: createRatingGroupController as never,
};
