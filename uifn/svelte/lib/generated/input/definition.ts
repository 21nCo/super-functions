import { InputContract, type InputProps } from '@uifn/core/primitives/input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const InputDefinition: SveltePrimitiveDefinition<InputProps> = {
  name: 'Input',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","value","defaultValue","name","disabled","readOnly","required","invalid"],
  contextKey: Symbol('uifn.Input'),
  contract: InputContract as never,
};
