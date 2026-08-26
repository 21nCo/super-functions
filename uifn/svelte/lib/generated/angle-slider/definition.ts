import { createAngleSliderController, type AngleSliderProps } from '@uifn/core/primitives/angle-slider';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const AngleSliderDefinition: SveltePrimitiveDefinition<AngleSliderProps> = {
  name: 'AngleSlider',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","disabled","readOnly"],
  contextKey: Symbol('uifn.AngleSlider'),
  createController: createAngleSliderController as never,
};
