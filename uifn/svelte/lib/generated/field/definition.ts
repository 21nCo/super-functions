import { FieldContract, type FieldProps } from '@uifn/core/primitives/field';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const FieldDefinition: SveltePrimitiveDefinition<FieldProps> = {
  name: 'Field',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["name","disabled","readOnly","required","invalid"],
  contextKey: Symbol('uifn.Field'),
  contract: FieldContract as never,
};
