import { createStepsController, type StepsProps } from '@uifn/core/primitives/steps';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const StepsDefinition: SveltePrimitiveDefinition<StepsProps> = {
  name: 'Steps',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["step","defaultStep","count","orientation","linear"],
  contextKey: Symbol('uifn.Steps'),
  createController: createStepsController as never,
};
