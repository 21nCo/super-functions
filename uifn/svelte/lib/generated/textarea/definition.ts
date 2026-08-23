import { TextareaContract, type TextareaProps } from '@uifn/core/primitives/textarea';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TextareaDefinition: SveltePrimitiveDefinition<TextareaProps> = {
  name: 'Textarea',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","placeholder","rows","disabled","readOnly","required","invalid","resize"],
  contextKey: Symbol('uifn.Textarea'),
  contract: TextareaContract as never,
};
