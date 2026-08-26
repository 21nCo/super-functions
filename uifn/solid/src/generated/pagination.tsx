import { createContext, type JSX } from 'solid-js';
import { createPaginationController, type PaginationProps, type PaginationController } from '@uifn/core/primitives/pagination';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const PaginationContext = createContext<SolidPrimitiveContextValue<PaginationProps>>();
export const PaginationDefinition: SolidPrimitiveDefinition<PaginationProps> = {
  name: 'Pagination',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["page","defaultPage","count","pageSize","siblingCount","disabled"],
  context: PaginationContext,
  createController: createPaginationController as never,
};

function PaginationRootElement(props: JSX.IntrinsicElements['nav']): JSX.Element {
  return <nav {...props} />;
}

export type PaginationRootProps = SolidPrimitiveRootProps<PaginationProps, 'nav'>;
export function PaginationRoot(props: PaginationRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={PaginationDefinition} element="nav" renderElement={PaginationRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function PaginationListElement(props: JSX.IntrinsicElements['ul']): JSX.Element {
  return <ul {...props} />;
}

export type PaginationListProps = SolidPrimitivePartProps<PaginationController['parts']['list'], 'ul', false>;
export function PaginationList(props: PaginationListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="list"
      element="ul"
      renderElement={PaginationListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PaginationItemElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type PaginationItemProps = SolidPrimitivePartProps<PaginationController['parts']['item'], 'li', true>;
export function PaginationItem(props: PaginationItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="item"
      element="li"
      renderElement={PaginationItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function PaginationPageTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PaginationPageTriggerProps = SolidPrimitivePartProps<PaginationController['parts']['pageTrigger'], 'button', true>;
export function PaginationPageTrigger(props: PaginationPageTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="pageTrigger"
      element="button"
      renderElement={PaginationPageTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function PaginationPreviousElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PaginationPreviousProps = SolidPrimitivePartProps<PaginationController['parts']['previous'], 'button', false>;
export function PaginationPrevious(props: PaginationPreviousProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="previous"
      element="button"
      renderElement={PaginationPreviousElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PaginationNextElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PaginationNextProps = SolidPrimitivePartProps<PaginationController['parts']['next'], 'button', false>;
export function PaginationNext(props: PaginationNextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="next"
      element="button"
      renderElement={PaginationNextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PaginationEllipsisElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type PaginationEllipsisProps = SolidPrimitivePartProps<PaginationController['parts']['ellipsis'], 'span', true>;
export function PaginationEllipsis(props: PaginationEllipsisProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PaginationDefinition as never}
      part="ellipsis"
      element="span"
      renderElement={PaginationEllipsisElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const PaginationProvider = PaginationRoot;
export const Pagination = /* @__PURE__ */ Object.assign(PaginationRoot, { Provider: PaginationProvider, Root: PaginationRoot, List: PaginationList, Item: PaginationItem, PageTrigger: PaginationPageTrigger, Previous: PaginationPrevious, Next: PaginationNext, Ellipsis: PaginationEllipsis });
