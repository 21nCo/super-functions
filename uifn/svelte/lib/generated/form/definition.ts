import { FormContract, type FormProps } from '@uifn/core/primitives/form';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const FormDefinition: SveltePrimitiveDefinition<FormProps> = {
  name: 'Form',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["noValidate","disabled"],
  contextKey: Symbol('uifn.Form'),
  contract: FormContract as never,
};
