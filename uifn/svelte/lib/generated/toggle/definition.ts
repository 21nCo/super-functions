import { createToggleController, type ToggleProps } from '@uifn/core/primitives/toggle';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ToggleDefinition: SveltePrimitiveDefinition<ToggleProps> = {
  name: 'Toggle',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["pressed","defaultPressed","disabled"],
  contextKey: Symbol('uifn.Toggle'),
  createController: createToggleController as never,
};
