import { InputGroupContract, type InputGroupProps } from '@uifn/core/primitives/input-group';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const InputGroupDefinition: SveltePrimitiveDefinition<InputGroupProps> = {
  name: 'InputGroup',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  contextKey: Symbol('uifn.InputGroup'),
  contract: InputGroupContract as never,
};
