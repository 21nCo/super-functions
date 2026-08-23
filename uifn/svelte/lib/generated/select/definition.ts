import { createSelectController, type SelectProps } from '@uifn/core/primitives/select';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SelectDefinition: SveltePrimitiveDefinition<SelectProps> = {
  name: 'Select',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","items","multiple","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.Select'),
  createController: createSelectController as never,
};
