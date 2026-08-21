import { SeparatorContract, type SeparatorProps } from '@uifn/core/primitives/separator';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SeparatorDefinition: SveltePrimitiveDefinition<SeparatorProps> = {
  name: 'Separator',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["orientation","decorative"],
  contextKey: Symbol('uifn.Separator'),
  contract: SeparatorContract as never,
};
