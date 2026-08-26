import { MeterContract, type MeterProps } from '@uifn/core/primitives/meter';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const MeterDefinition: SveltePrimitiveDefinition<MeterProps> = {
  name: 'Meter',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","low","high","optimum","formatValue"],
  contextKey: Symbol('uifn.Meter'),
  contract: MeterContract as never,
};
