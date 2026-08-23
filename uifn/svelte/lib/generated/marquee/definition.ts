import { MarqueeContract, type MarqueeProps } from '@uifn/core/primitives/marquee';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const MarqueeDefinition: SveltePrimitiveDefinition<MarqueeProps> = {
  name: 'Marquee',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["direction","speed","pauseOnHover","pauseOnFocus","reducedMotionBehavior"],
  contextKey: Symbol('uifn.Marquee'),
  contract: MarqueeContract as never,
};
