import { AvatarContract, type AvatarProps } from '@uifn/core/primitives/avatar';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const AvatarDefinition: SveltePrimitiveDefinition<AvatarProps> = {
  name: 'Avatar',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["src","alt","fallbackDelay"],
  contextKey: Symbol('uifn.Avatar'),
  contract: AvatarContract as never,
};
