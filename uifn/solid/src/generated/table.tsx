import { createContext, type JSX } from 'solid-js';
import { TableContract, type TableProps, type TableContractParts } from '@uifn/core/primitives/table';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TableContext = createContext<SolidPrimitiveContextValue<TableProps>>();
export const TableDefinition: SolidPrimitiveDefinition<TableProps> = {
  name: 'Table',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["striped"],
  context: TableContext,
  contract: TableContract as never,
};

function TableRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TableRootProps = SolidPrimitiveRootProps<TableProps, 'div'>;
export function TableRoot(props: TableRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TableDefinition} element="div" renderElement={TableRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TableTableElement(props: JSX.IntrinsicElements['table']): JSX.Element {
  return <table {...props} />;
}

export type TableTableProps = SolidPrimitivePartProps<TableContractParts['table'], 'table', false>;
export function TableTable(props: TableTableProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="table"
      element="table"
      renderElement={TableTableElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TableHeaderElement(props: JSX.IntrinsicElements['thead']): JSX.Element {
  return <thead {...props} />;
}

export type TableHeaderProps = SolidPrimitivePartProps<TableContractParts['header'], 'thead', false>;
export function TableHeader(props: TableHeaderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="header"
      element="thead"
      renderElement={TableHeaderElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TableBodyElement(props: JSX.IntrinsicElements['tbody']): JSX.Element {
  return <tbody {...props} />;
}

export type TableBodyProps = SolidPrimitivePartProps<TableContractParts['body'], 'tbody', false>;
export function TableBody(props: TableBodyProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="body"
      element="tbody"
      renderElement={TableBodyElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TableFooterElement(props: JSX.IntrinsicElements['tfoot']): JSX.Element {
  return <tfoot {...props} />;
}

export type TableFooterProps = SolidPrimitivePartProps<TableContractParts['footer'], 'tfoot', false>;
export function TableFooter(props: TableFooterProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="footer"
      element="tfoot"
      renderElement={TableFooterElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TableRowElement(props: JSX.IntrinsicElements['tr']): JSX.Element {
  return <tr {...props} />;
}

export type TableRowProps = SolidPrimitivePartProps<TableContractParts['row'], 'tr', true>;
export function TableRow(props: TableRowProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="row"
      element="tr"
      renderElement={TableRowElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TableHeadElement(props: JSX.IntrinsicElements['th']): JSX.Element {
  return <th {...props} />;
}

export type TableHeadProps = SolidPrimitivePartProps<TableContractParts['head'], 'th', true>;
export function TableHead(props: TableHeadProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="head"
      element="th"
      renderElement={TableHeadElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TableCellElement(props: JSX.IntrinsicElements['td']): JSX.Element {
  return <td {...props} />;
}

export type TableCellProps = SolidPrimitivePartProps<TableContractParts['cell'], 'td', true>;
export function TableCell(props: TableCellProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="cell"
      element="td"
      renderElement={TableCellElement as never}
      many={true}
      props={props as never}
    />
  );
}

function TableCaptionElement(props: JSX.IntrinsicElements['caption']): JSX.Element {
  return <caption {...props} />;
}

export type TableCaptionProps = SolidPrimitivePartProps<TableContractParts['caption'], 'caption', false>;
export function TableCaption(props: TableCaptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TableDefinition as never}
      part="caption"
      element="caption"
      renderElement={TableCaptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TableProvider = TableRoot;
export const Table = /* @__PURE__ */ Object.assign(TableRoot, { Provider: TableProvider, Root: TableRoot, Table: TableTable, Header: TableHeader, Body: TableBody, Footer: TableFooter, Row: TableRow, Head: TableHead, Cell: TableCell, Caption: TableCaption });
