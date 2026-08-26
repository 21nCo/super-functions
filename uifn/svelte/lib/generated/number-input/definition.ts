import { createNumberInputController, type NumberInputProps } from '@uifn/core/primitives/number-input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const NumberInputDefinition: SveltePrimitiveDefinition<NumberInputProps> = {
  name: 'NumberInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","locale","name","disabled","readOnly","required"],
  contextKey: Symbol('uifn.NumberInput'),
  createController: createNumberInputController as never,
};
