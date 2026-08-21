import { FieldsetContract, type FieldsetProps } from '@uifn/core/primitives/fieldset';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const FieldsetDefinition: SveltePrimitiveDefinition<FieldsetProps> = {
  name: 'Fieldset',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  contextKey: Symbol('uifn.Fieldset'),
  contract: FieldsetContract as never,
};
