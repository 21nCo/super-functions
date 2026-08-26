'use client';

import * as React from 'react';
import { createMenubarController, type MenubarProps, type MenubarController } from '@uifn/core/primitives/menubar';
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

const MenubarContext = React.createContext<ReactPrimitiveBridge<MenubarProps> | null>(null);
const MenubarDefinition: ReactPrimitiveDefinition<MenubarProps> = {
  name: 'Menubar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","loop","dir"],
  context: MenubarContext,
  createController: createMenubarController as never,
};

export type MenubarRootProps = ReactPrimitiveRootProps<MenubarProps, 'div'>;
export const MenubarRoot = React.forwardRef<React.ElementRef<'div'>, MenubarRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={MenubarDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarRoot.displayName = 'MenubarRoot';

export type MenubarMenuProps = ReactPrimitivePartProps<MenubarController['parts']['menu'], 'div', true>;
export const MenubarMenu = React.forwardRef<React.ElementRef<'div'>, MenubarMenuProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="menu" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarMenu.displayName = 'MenubarMenu';

export type MenubarTriggerProps = ReactPrimitivePartProps<MenubarController['parts']['trigger'], 'button', true>;
export const MenubarTrigger = React.forwardRef<React.ElementRef<'button'>, MenubarTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="trigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarTrigger.displayName = 'MenubarTrigger';

export type MenubarContentProps = ReactPrimitivePartProps<MenubarController['parts']['content'], 'div', true>;
export const MenubarContent = React.forwardRef<React.ElementRef<'div'>, MenubarContentProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="content" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarContent.displayName = 'MenubarContent';

export type MenubarItemProps = ReactPrimitivePartProps<MenubarController['parts']['item'], 'div', true>;
export const MenubarItem = React.forwardRef<React.ElementRef<'div'>, MenubarItemProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarItem.displayName = 'MenubarItem';

export type MenubarSubmenuTriggerProps = ReactPrimitivePartProps<MenubarController['parts']['submenuTrigger'], 'div', true>;
export const MenubarSubmenuTrigger = React.forwardRef<React.ElementRef<'div'>, MenubarSubmenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="submenuTrigger" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarSubmenuTrigger.displayName = 'MenubarSubmenuTrigger';

export type MenubarSubmenuContentProps = ReactPrimitivePartProps<MenubarController['parts']['submenuContent'], 'div', true>;
export const MenubarSubmenuContent = React.forwardRef<React.ElementRef<'div'>, MenubarSubmenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={MenubarDefinition as never} part="submenuContent" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenubarSubmenuContent.displayName = 'MenubarSubmenuContent';

export const MenubarProvider = MenubarRoot;
export function useMenubar(inputs: MenubarProps = {} as MenubarProps): ReactPrimitiveHookResult<MenubarController['state'], MenubarController['actions']> {
  return useReactPrimitive(MenubarDefinition, inputs) as ReactPrimitiveHookResult<MenubarController['state'], MenubarController['actions']>;
}
export const Menubar = Object.assign(MenubarRoot, { Provider: MenubarProvider, Root: MenubarRoot, Menu: MenubarMenu, Trigger: MenubarTrigger, Content: MenubarContent, Item: MenubarItem, SubmenuTrigger: MenubarSubmenuTrigger, SubmenuContent: MenubarSubmenuContent });
