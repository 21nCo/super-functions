'use client';

import * as React from 'react';
import { TableContract, type TableProps, type TableContractParts } from '@uifn/core/primitives/table';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const TableContext = React.createContext<ReactPrimitiveBridge<TableProps> | null>(null);
const TableDefinition: ReactPrimitiveDefinition<TableProps> = {
  name: 'Table',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["striped"],
  context: TableContext,
  contract: TableContract as never,
};

export type TableRootProps = ReactPrimitiveRootProps<TableProps, 'div'>;
export const TableRoot = React.forwardRef<React.ElementRef<'div'>, TableRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TableDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableRoot.displayName = 'TableRoot';

export type TableTableProps = ReactPrimitivePartProps<TableContractParts['table'], 'table', false>;
export const TableTable = React.forwardRef<React.ElementRef<'table'>, TableTableProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="table" element="table" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableTable.displayName = 'TableTable';

export type TableHeaderProps = ReactPrimitivePartProps<TableContractParts['header'], 'thead', false>;
export const TableHeader = React.forwardRef<React.ElementRef<'thead'>, TableHeaderProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="header" element="thead" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableHeader.displayName = 'TableHeader';

export type TableBodyProps = ReactPrimitivePartProps<TableContractParts['body'], 'tbody', false>;
export const TableBody = React.forwardRef<React.ElementRef<'tbody'>, TableBodyProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="body" element="tbody" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableBody.displayName = 'TableBody';

export type TableFooterProps = ReactPrimitivePartProps<TableContractParts['footer'], 'tfoot', false>;
export const TableFooter = React.forwardRef<React.ElementRef<'tfoot'>, TableFooterProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="footer" element="tfoot" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableFooter.displayName = 'TableFooter';

export type TableRowProps = ReactPrimitivePartProps<TableContractParts['row'], 'tr', true>;
export const TableRow = React.forwardRef<React.ElementRef<'tr'>, TableRowProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="row" element="tr" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableRow.displayName = 'TableRow';

export type TableHeadProps = ReactPrimitivePartProps<TableContractParts['head'], 'th', true>;
export const TableHead = React.forwardRef<React.ElementRef<'th'>, TableHeadProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="head" element="th" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableHead.displayName = 'TableHead';

export type TableCellProps = ReactPrimitivePartProps<TableContractParts['cell'], 'td', true>;
export const TableCell = React.forwardRef<React.ElementRef<'td'>, TableCellProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="cell" element="td" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableCell.displayName = 'TableCell';

export type TableCaptionProps = ReactPrimitivePartProps<TableContractParts['caption'], 'caption', false>;
export const TableCaption = React.forwardRef<React.ElementRef<'caption'>, TableCaptionProps>((props, ref) => (
  <ReactPrimitivePart definition={TableDefinition as never} part="caption" element="caption" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TableCaption.displayName = 'TableCaption';

export const TableProvider = TableRoot;
export function useTable(inputs: TableProps = {} as TableProps): ReactPrimitiveHookResult<ReturnType<typeof TableContract.getState>, Record<string, never>> {
  return useReactPrimitive(TableDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof TableContract.getState>, Record<string, never>>;
}
export const Table = Object.assign(TableRoot, { Provider: TableProvider, Root: TableRoot, Table: TableTable, Header: TableHeader, Body: TableBody, Footer: TableFooter, Row: TableRow, Head: TableHead, Cell: TableCell, Caption: TableCaption });
