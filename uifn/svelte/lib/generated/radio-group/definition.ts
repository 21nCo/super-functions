import { createRadioGroupController, type RadioGroupProps } from '@uifn/core/primitives/radio-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const RadioGroupDefinition: SveltePrimitiveDefinition<RadioGroupProps> = {
  name: 'RadioGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","orientation","loop","disabled","readOnly","required"],
  contextKey: Symbol('uifn.RadioGroup'),
  createController: createRadioGroupController as never,
};
