import { createToggleGroupController, type ToggleGroupProps } from '@uifn/core/primitives/toggle-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ToggleGroupDefinition: SveltePrimitiveDefinition<ToggleGroupProps> = {
  name: 'ToggleGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","type","orientation","loop","disabled"],
  contextKey: Symbol('uifn.ToggleGroup'),
  createController: createToggleGroupController as never,
};
