import { ProgressContract, type ProgressProps } from '@uifn/core/primitives/progress';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const ProgressDefinition: SveltePrimitiveDefinition<ProgressProps> = {
  name: 'Progress',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","indeterminate","formatValue"],
  contextKey: Symbol('uifn.Progress'),
  contract: ProgressContract as never,
};
