import { BadgeContract, type BadgeProps } from '@uifn/core/primitives/badge';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const BadgeDefinition: SveltePrimitiveDefinition<BadgeProps> = {
  name: 'Badge',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["variant"],
  contextKey: Symbol('uifn.Badge'),
  contract: BadgeContract as never,
};
