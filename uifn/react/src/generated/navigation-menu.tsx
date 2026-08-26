'use client';

import * as React from 'react';
import { createNavigationMenuController, type NavigationMenuProps, type NavigationMenuController } from '@uifn/core/primitives/navigation-menu';
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

const NavigationMenuContext = React.createContext<ReactPrimitiveBridge<NavigationMenuProps> | null>(null);
const NavigationMenuDefinition: ReactPrimitiveDefinition<NavigationMenuProps> = {
  name: 'NavigationMenu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","orientation","delayDuration","skipDelayDuration","dir"],
  context: NavigationMenuContext,
  createController: createNavigationMenuController as never,
};

export type NavigationMenuRootProps = ReactPrimitiveRootProps<NavigationMenuProps, 'nav'>;
export const NavigationMenuRoot = React.forwardRef<React.ElementRef<'nav'>, NavigationMenuRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={NavigationMenuDefinition} element="nav" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuRoot.displayName = 'NavigationMenuRoot';

export type NavigationMenuListProps = ReactPrimitivePartProps<NavigationMenuController['parts']['list'], 'ul', false>;
export const NavigationMenuList = React.forwardRef<React.ElementRef<'ul'>, NavigationMenuListProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="list" element="ul" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuList.displayName = 'NavigationMenuList';

export type NavigationMenuItemProps = ReactPrimitivePartProps<NavigationMenuController['parts']['item'], 'li', true>;
export const NavigationMenuItem = React.forwardRef<React.ElementRef<'li'>, NavigationMenuItemProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="item" element="li" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuItem.displayName = 'NavigationMenuItem';

export type NavigationMenuTriggerProps = ReactPrimitivePartProps<NavigationMenuController['parts']['trigger'], 'button', true>;
export const NavigationMenuTrigger = React.forwardRef<React.ElementRef<'button'>, NavigationMenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="trigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuTrigger.displayName = 'NavigationMenuTrigger';

export type NavigationMenuContentProps = ReactPrimitivePartProps<NavigationMenuController['parts']['content'], 'div', true>;
export const NavigationMenuContent = React.forwardRef<React.ElementRef<'div'>, NavigationMenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="content" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuContent.displayName = 'NavigationMenuContent';

export type NavigationMenuLinkProps = ReactPrimitivePartProps<NavigationMenuController['parts']['link'], 'a', true>;
export const NavigationMenuLink = React.forwardRef<React.ElementRef<'a'>, NavigationMenuLinkProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="link" element="a" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuLink.displayName = 'NavigationMenuLink';

export type NavigationMenuViewportProps = ReactPrimitivePartProps<NavigationMenuController['parts']['viewport'], 'div', false>;
export const NavigationMenuViewport = React.forwardRef<React.ElementRef<'div'>, NavigationMenuViewportProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="viewport" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuViewport.displayName = 'NavigationMenuViewport';

export type NavigationMenuIndicatorProps = ReactPrimitivePartProps<NavigationMenuController['parts']['indicator'], 'div', false>;
export const NavigationMenuIndicator = React.forwardRef<React.ElementRef<'div'>, NavigationMenuIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={NavigationMenuDefinition as never} part="indicator" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
NavigationMenuIndicator.displayName = 'NavigationMenuIndicator';

export const NavigationMenuProvider = NavigationMenuRoot;
export function useNavigationMenu(inputs: NavigationMenuProps = {} as NavigationMenuProps): ReactPrimitiveHookResult<NavigationMenuController['state'], NavigationMenuController['actions']> {
  return useReactPrimitive(NavigationMenuDefinition, inputs) as ReactPrimitiveHookResult<NavigationMenuController['state'], NavigationMenuController['actions']>;
}
export const NavigationMenu = Object.assign(NavigationMenuRoot, { Provider: NavigationMenuProvider, Root: NavigationMenuRoot, List: NavigationMenuList, Item: NavigationMenuItem, Trigger: NavigationMenuTrigger, Content: NavigationMenuContent, Link: NavigationMenuLink, Viewport: NavigationMenuViewport, Indicator: NavigationMenuIndicator });
