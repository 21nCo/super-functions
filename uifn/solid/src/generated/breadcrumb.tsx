import { createContext, type JSX } from 'solid-js';
import { BreadcrumbContract, type BreadcrumbProps, type BreadcrumbContractParts } from '@uifn/core/primitives/breadcrumb';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const BreadcrumbContext = createContext<SolidPrimitiveContextValue<BreadcrumbProps>>();
export const BreadcrumbDefinition: SolidPrimitiveDefinition<BreadcrumbProps> = {
  name: 'Breadcrumb',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["label"],
  context: BreadcrumbContext,
  contract: BreadcrumbContract as never,
};

function BreadcrumbRootElement(props: JSX.IntrinsicElements['nav']): JSX.Element {
  return <nav {...props} />;
}

export type BreadcrumbRootProps = SolidPrimitiveRootProps<BreadcrumbProps, 'nav'>;
export function BreadcrumbRoot(props: BreadcrumbRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={BreadcrumbDefinition} element="nav" renderElement={BreadcrumbRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function BreadcrumbListElement(props: JSX.IntrinsicElements['ol']): JSX.Element {
  return <ol {...props} />;
}

export type BreadcrumbListProps = SolidPrimitivePartProps<BreadcrumbContractParts['list'], 'ol', false>;
export function BreadcrumbList(props: BreadcrumbListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="list"
      element="ol"
      renderElement={BreadcrumbListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function BreadcrumbItemElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type BreadcrumbItemProps = SolidPrimitivePartProps<BreadcrumbContractParts['item'], 'li', true>;
export function BreadcrumbItem(props: BreadcrumbItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="item"
      element="li"
      renderElement={BreadcrumbItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function BreadcrumbLinkElement(props: JSX.IntrinsicElements['a']): JSX.Element {
  return <a {...props} />;
}

export type BreadcrumbLinkProps = SolidPrimitivePartProps<BreadcrumbContractParts['link'], 'a', true>;
export function BreadcrumbLink(props: BreadcrumbLinkProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="link"
      element="a"
      renderElement={BreadcrumbLinkElement as never}
      many={true}
      props={props as never}
    />
  );
}

function BreadcrumbPageElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type BreadcrumbPageProps = SolidPrimitivePartProps<BreadcrumbContractParts['page'], 'span', false>;
export function BreadcrumbPage(props: BreadcrumbPageProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="page"
      element="span"
      renderElement={BreadcrumbPageElement as never}
      many={false}
      props={props as never}
    />
  );
}

function BreadcrumbSeparatorElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type BreadcrumbSeparatorProps = SolidPrimitivePartProps<BreadcrumbContractParts['separator'], 'li', true>;
export function BreadcrumbSeparator(props: BreadcrumbSeparatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="separator"
      element="li"
      renderElement={BreadcrumbSeparatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

function BreadcrumbEllipsisElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type BreadcrumbEllipsisProps = SolidPrimitivePartProps<BreadcrumbContractParts['ellipsis'], 'span', false>;
export function BreadcrumbEllipsis(props: BreadcrumbEllipsisProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={BreadcrumbDefinition as never}
      part="ellipsis"
      element="span"
      renderElement={BreadcrumbEllipsisElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const BreadcrumbProvider = BreadcrumbRoot;
export const Breadcrumb = /* @__PURE__ */ Object.assign(BreadcrumbRoot, { Provider: BreadcrumbProvider, Root: BreadcrumbRoot, List: BreadcrumbList, Item: BreadcrumbItem, Link: BreadcrumbLink, Page: BreadcrumbPage, Separator: BreadcrumbSeparator, Ellipsis: BreadcrumbEllipsis });
