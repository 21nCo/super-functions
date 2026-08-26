'use client';

import * as React from 'react';
import { createPaginationController, type PaginationProps, type PaginationController } from '@uifn/core/primitives/pagination';
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

const PaginationContext = React.createContext<ReactPrimitiveBridge<PaginationProps> | null>(null);
const PaginationDefinition: ReactPrimitiveDefinition<PaginationProps> = {
  name: 'Pagination',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["page","defaultPage","count","pageSize","siblingCount","disabled"],
  context: PaginationContext,
  createController: createPaginationController as never,
};

export type PaginationRootProps = ReactPrimitiveRootProps<PaginationProps, 'nav'>;
export const PaginationRoot = React.forwardRef<React.ElementRef<'nav'>, PaginationRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={PaginationDefinition} element="nav" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationRoot.displayName = 'PaginationRoot';

export type PaginationListProps = ReactPrimitivePartProps<PaginationController['parts']['list'], 'ul', false>;
export const PaginationList = React.forwardRef<React.ElementRef<'ul'>, PaginationListProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="list" element="ul" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationList.displayName = 'PaginationList';

export type PaginationItemProps = ReactPrimitivePartProps<PaginationController['parts']['item'], 'li', true>;
export const PaginationItem = React.forwardRef<React.ElementRef<'li'>, PaginationItemProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="item" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationItem.displayName = 'PaginationItem';

export type PaginationPageTriggerProps = ReactPrimitivePartProps<PaginationController['parts']['pageTrigger'], 'button', true>;
export const PaginationPageTrigger = React.forwardRef<React.ElementRef<'button'>, PaginationPageTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="pageTrigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationPageTrigger.displayName = 'PaginationPageTrigger';

export type PaginationPreviousProps = ReactPrimitivePartProps<PaginationController['parts']['previous'], 'button', false>;
export const PaginationPrevious = React.forwardRef<React.ElementRef<'button'>, PaginationPreviousProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="previous" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationPrevious.displayName = 'PaginationPrevious';

export type PaginationNextProps = ReactPrimitivePartProps<PaginationController['parts']['next'], 'button', false>;
export const PaginationNext = React.forwardRef<React.ElementRef<'button'>, PaginationNextProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="next" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationNext.displayName = 'PaginationNext';

export type PaginationEllipsisProps = ReactPrimitivePartProps<PaginationController['parts']['ellipsis'], 'span', true>;
export const PaginationEllipsis = React.forwardRef<React.ElementRef<'span'>, PaginationEllipsisProps>((props, ref) => (
  <ReactPrimitivePart definition={PaginationDefinition as never} part="ellipsis" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PaginationEllipsis.displayName = 'PaginationEllipsis';

export const PaginationProvider = PaginationRoot;
export function usePagination(inputs: PaginationProps): ReactPrimitiveHookResult<PaginationController['state'], PaginationController['actions']> {
  return useReactPrimitive(PaginationDefinition, inputs) as ReactPrimitiveHookResult<PaginationController['state'], PaginationController['actions']>;
}
export const Pagination = Object.assign(PaginationRoot, { Provider: PaginationProvider, Root: PaginationRoot, List: PaginationList, Item: PaginationItem, PageTrigger: PaginationPageTrigger, Previous: PaginationPrevious, Next: PaginationNext, Ellipsis: PaginationEllipsis });
