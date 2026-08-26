import { createContext, type JSX } from 'solid-js';
import { createNavigationMenuController, type NavigationMenuProps, type NavigationMenuController } from '@uifn/core/primitives/navigation-menu';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const NavigationMenuContext = createContext<SolidPrimitiveContextValue<NavigationMenuProps>>();
export const NavigationMenuDefinition: SolidPrimitiveDefinition<NavigationMenuProps> = {
  name: 'NavigationMenu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","orientation","delayDuration","skipDelayDuration","dir"],
  context: NavigationMenuContext,
  createController: createNavigationMenuController as never,
};

function NavigationMenuRootElement(props: JSX.IntrinsicElements['nav']): JSX.Element {
  return <nav {...props} />;
}

export type NavigationMenuRootProps = SolidPrimitiveRootProps<NavigationMenuProps, 'nav'>;
export function NavigationMenuRoot(props: NavigationMenuRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={NavigationMenuDefinition} element="nav" renderElement={NavigationMenuRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function NavigationMenuListElement(props: JSX.IntrinsicElements['ul']): JSX.Element {
  return <ul {...props} />;
}

export type NavigationMenuListProps = SolidPrimitivePartProps<NavigationMenuController['parts']['list'], 'ul', false>;
export function NavigationMenuList(props: NavigationMenuListProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="list"
      element="ul"
      renderElement={NavigationMenuListElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NavigationMenuItemElement(props: JSX.IntrinsicElements['li']): JSX.Element {
  return <li {...props} />;
}

export type NavigationMenuItemProps = SolidPrimitivePartProps<NavigationMenuController['parts']['item'], 'li', true>;
export function NavigationMenuItem(props: NavigationMenuItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="item"
      element="li"
      renderElement={NavigationMenuItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function NavigationMenuTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type NavigationMenuTriggerProps = SolidPrimitivePartProps<NavigationMenuController['parts']['trigger'], 'button', true>;
export function NavigationMenuTrigger(props: NavigationMenuTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="trigger"
      element="button"
      renderElement={NavigationMenuTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function NavigationMenuContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NavigationMenuContentProps = SolidPrimitivePartProps<NavigationMenuController['parts']['content'], 'div', true>;
export function NavigationMenuContent(props: NavigationMenuContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="content"
      element="div"
      renderElement={NavigationMenuContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function NavigationMenuLinkElement(props: JSX.IntrinsicElements['a']): JSX.Element {
  return <a {...props} />;
}

export type NavigationMenuLinkProps = SolidPrimitivePartProps<NavigationMenuController['parts']['link'], 'a', true>;
export function NavigationMenuLink(props: NavigationMenuLinkProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="link"
      element="a"
      renderElement={NavigationMenuLinkElement as never}
      many={true}
      props={props as never}
    />
  );
}

function NavigationMenuViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NavigationMenuViewportProps = SolidPrimitivePartProps<NavigationMenuController['parts']['viewport'], 'div', false>;
export function NavigationMenuViewport(props: NavigationMenuViewportProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="viewport"
      element="div"
      renderElement={NavigationMenuViewportElement as never}
      many={false}
      props={props as never}
    />
  );
}

function NavigationMenuIndicatorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type NavigationMenuIndicatorProps = SolidPrimitivePartProps<NavigationMenuController['parts']['indicator'], 'div', false>;
export function NavigationMenuIndicator(props: NavigationMenuIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={NavigationMenuDefinition as never}
      part="indicator"
      element="div"
      renderElement={NavigationMenuIndicatorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const NavigationMenuProvider = NavigationMenuRoot;
export const NavigationMenu = /* @__PURE__ */ Object.assign(NavigationMenuRoot, { Provider: NavigationMenuProvider, Root: NavigationMenuRoot, List: NavigationMenuList, Item: NavigationMenuItem, Trigger: NavigationMenuTrigger, Content: NavigationMenuContent, Link: NavigationMenuLink, Viewport: NavigationMenuViewport, Indicator: NavigationMenuIndicator });
