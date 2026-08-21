import { CardContract, type CardProps } from '@uifn/core/primitives/card';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const CardDefinition: SveltePrimitiveDefinition<CardProps> = {
  name: 'Card',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["elevated"],
  contextKey: Symbol('uifn.Card'),
  contract: CardContract as never,
};
