import { ButtonContract, type ButtonProps } from '@uifn/core/primitives/button';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ButtonDefinition: SveltePrimitiveDefinition<ButtonProps> = {
  name: 'Button',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","disabled","loading","pressed"],
  contextKey: Symbol('uifn.Button'),
  contract: ButtonContract as never,
};
