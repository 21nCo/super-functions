import { createCheckboxGroupController, type CheckboxGroupProps } from '@uifn/core/primitives/checkbox-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CheckboxGroupDefinition: SveltePrimitiveDefinition<CheckboxGroupProps> = {
  name: 'CheckboxGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.CheckboxGroup'),
  createController: createCheckboxGroupController as never,
};
