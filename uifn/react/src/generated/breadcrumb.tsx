'use client';

import * as React from 'react';
import { BreadcrumbContract, type BreadcrumbProps, type BreadcrumbContractParts } from '@uifn/core/primitives/breadcrumb';
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

const BreadcrumbContext = React.createContext<ReactPrimitiveBridge<BreadcrumbProps> | null>(null);
const BreadcrumbDefinition: ReactPrimitiveDefinition<BreadcrumbProps> = {
  name: 'Breadcrumb',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["label"],
  context: BreadcrumbContext,
  contract: BreadcrumbContract as never,
};

export type BreadcrumbRootProps = ReactPrimitiveRootProps<BreadcrumbProps, 'nav'>;
export const BreadcrumbRoot = React.forwardRef<React.ElementRef<'nav'>, BreadcrumbRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={BreadcrumbDefinition} element="nav" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbRoot.displayName = 'BreadcrumbRoot';

export type BreadcrumbListProps = ReactPrimitivePartProps<BreadcrumbContractParts['list'], 'ol', false>;
export const BreadcrumbList = React.forwardRef<React.ElementRef<'ol'>, BreadcrumbListProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="list" element="ol" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbList.displayName = 'BreadcrumbList';

export type BreadcrumbItemProps = ReactPrimitivePartProps<BreadcrumbContractParts['item'], 'li', true>;
export const BreadcrumbItem = React.forwardRef<React.ElementRef<'li'>, BreadcrumbItemProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="item" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbItem.displayName = 'BreadcrumbItem';

export type BreadcrumbLinkProps = ReactPrimitivePartProps<BreadcrumbContractParts['link'], 'a', true>;
export const BreadcrumbLink = React.forwardRef<React.ElementRef<'a'>, BreadcrumbLinkProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="link" element="a" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbLink.displayName = 'BreadcrumbLink';

export type BreadcrumbPageProps = ReactPrimitivePartProps<BreadcrumbContractParts['page'], 'span', false>;
export const BreadcrumbPage = React.forwardRef<React.ElementRef<'span'>, BreadcrumbPageProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="page" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbPage.displayName = 'BreadcrumbPage';

export type BreadcrumbSeparatorProps = ReactPrimitivePartProps<BreadcrumbContractParts['separator'], 'li', true>;
export const BreadcrumbSeparator = React.forwardRef<React.ElementRef<'li'>, BreadcrumbSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="separator" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbSeparator.displayName = 'BreadcrumbSeparator';

export type BreadcrumbEllipsisProps = ReactPrimitivePartProps<BreadcrumbContractParts['ellipsis'], 'span', false>;
export const BreadcrumbEllipsis = React.forwardRef<React.ElementRef<'span'>, BreadcrumbEllipsisProps>((props, ref) => (
  <ReactPrimitivePart definition={BreadcrumbDefinition as never} part="ellipsis" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BreadcrumbEllipsis.displayName = 'BreadcrumbEllipsis';

export const BreadcrumbProvider = BreadcrumbRoot;
export function useBreadcrumb(inputs: BreadcrumbProps = {} as BreadcrumbProps): ReactPrimitiveHookResult<ReturnType<typeof BreadcrumbContract.getState>, Record<string, never>> {
  return useReactPrimitive(BreadcrumbDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof BreadcrumbContract.getState>, Record<string, never>>;
}
export const Breadcrumb = Object.assign(BreadcrumbRoot, { Provider: BreadcrumbProvider, Root: BreadcrumbRoot, List: BreadcrumbList, Item: BreadcrumbItem, Link: BreadcrumbLink, Page: BreadcrumbPage, Separator: BreadcrumbSeparator, Ellipsis: BreadcrumbEllipsis });
