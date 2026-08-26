import { TableContract, type TableProps } from '@uifn/core/primitives/table';
import type { SveltePrimitiveDefinition } from '../../internal/compound.js';

export const TableDefinition: SveltePrimitiveDefinition<TableProps> = {
  name: 'Table',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["striped"],
  contextKey: Symbol('uifn.Table'),
  contract: TableContract as never,
};
