import { SkeletonContract, type SkeletonProps } from '@uifn/core/primitives/skeleton';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const SkeletonDefinition: SveltePrimitiveDefinition<SkeletonProps> = {
  name: 'Skeleton',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["visible"],
  contextKey: Symbol('uifn.Skeleton'),
  contract: SkeletonContract as never,
};
