import { createPasswordInputController, type PasswordInputProps } from '@uifn/core/primitives/password-input';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const PasswordInputDefinition: SveltePrimitiveDefinition<PasswordInputProps> = {
  name: 'PasswordInput',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","visible","name","autocomplete","disabled","readOnly","required"],
  contextKey: Symbol('uifn.PasswordInput'),
  createController: createPasswordInputController as never,
};
