import type { ComponentProps } from 'svelte';
import TableRootComponent from './Root.svelte';
import TableTableComponent from './Table.svelte';
import TableHeaderComponent from './Header.svelte';
import TableBodyComponent from './Body.svelte';
import TableFooterComponent from './Footer.svelte';
import TableRowComponent from './Row.svelte';
import TableHeadComponent from './Head.svelte';
import TableCellComponent from './Cell.svelte';
import TableCaptionComponent from './Caption.svelte';

export const TableRoot = TableRootComponent;
export type TableRootProps = ComponentProps<typeof TableRootComponent>;

export const TableTable = TableTableComponent;
export type TableTableProps = ComponentProps<typeof TableTableComponent>;

export const TableHeader = TableHeaderComponent;
export type TableHeaderProps = ComponentProps<typeof TableHeaderComponent>;

export const TableBody = TableBodyComponent;
export type TableBodyProps = ComponentProps<typeof TableBodyComponent>;

export const TableFooter = TableFooterComponent;
export type TableFooterProps = ComponentProps<typeof TableFooterComponent>;

export const TableRow = TableRowComponent;
export type TableRowProps = ComponentProps<typeof TableRowComponent>;

export const TableHead = TableHeadComponent;
export type TableHeadProps = ComponentProps<typeof TableHeadComponent>;

export const TableCell = TableCellComponent;
export type TableCellProps = ComponentProps<typeof TableCellComponent>;

export const TableCaption = TableCaptionComponent;
export type TableCaptionProps = ComponentProps<typeof TableCaptionComponent>;

export const TableProvider = TableRoot;
export const Table = Object.assign(TableRoot, { Provider: TableProvider, Root: TableRoot, Table: TableTable, Header: TableHeader, Body: TableBody, Footer: TableFooter, Row: TableRow, Head: TableHead, Cell: TableCell, Caption: TableCaption });
