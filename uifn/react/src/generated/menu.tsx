'use client';

import * as React from 'react';
import { createMenuController, type MenuProps, type MenuController } from '@uifn/core/primitives/menu';
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

const MenuContext = React.createContext<ReactPrimitiveBridge<MenuProps> | null>(null);
const MenuDefinition: ReactPrimitiveDefinition<MenuProps> = {
  name: 'Menu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","orientation","loop","dir"],
  context: MenuContext,
  createController: createMenuController as never,
};

export type MenuRootProps = ReactPrimitiveRootProps<MenuProps, 'div'>;
export const MenuRoot = React.forwardRef<React.ElementRef<'div'>, MenuRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={MenuDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuRoot.displayName = 'MenuRoot';

export type MenuTriggerProps = ReactPrimitivePartProps<MenuController['parts']['trigger'], 'button', false>;
export const MenuTrigger = React.forwardRef<React.ElementRef<'button'>, MenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuTrigger.displayName = 'MenuTrigger';

export type MenuPositionerProps = ReactPrimitivePartProps<MenuController['parts']['positioner'], 'div', false>;
export const MenuPositioner = React.forwardRef<React.ElementRef<'div'>, MenuPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuPositioner.displayName = 'MenuPositioner';

export type MenuContentProps = ReactPrimitivePartProps<MenuController['parts']['content'], 'div', false>;
export const MenuContent = React.forwardRef<React.ElementRef<'div'>, MenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuContent.displayName = 'MenuContent';

export type MenuItemProps = ReactPrimitivePartProps<MenuController['parts']['item'], 'div', true>;
export const MenuItem = React.forwardRef<React.ElementRef<'div'>, MenuItemProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuItem.displayName = 'MenuItem';

export type MenuItemIndicatorProps = ReactPrimitivePartProps<MenuController['parts']['itemIndicator'], 'span', true>;
export const MenuItemIndicator = React.forwardRef<React.ElementRef<'span'>, MenuItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuItemIndicator.displayName = 'MenuItemIndicator';

export type MenuSeparatorProps = ReactPrimitivePartProps<MenuController['parts']['separator'], 'div', true>;
export const MenuSeparator = React.forwardRef<React.ElementRef<'div'>, MenuSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="separator" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuSeparator.displayName = 'MenuSeparator';

export type MenuGroupProps = ReactPrimitivePartProps<MenuController['parts']['group'], 'div', true>;
export const MenuGroup = React.forwardRef<React.ElementRef<'div'>, MenuGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="group" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuGroup.displayName = 'MenuGroup';

export type MenuGroupLabelProps = ReactPrimitivePartProps<MenuController['parts']['groupLabel'], 'div', true>;
export const MenuGroupLabel = React.forwardRef<React.ElementRef<'div'>, MenuGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="groupLabel" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuGroupLabel.displayName = 'MenuGroupLabel';

export type MenuSubmenuTriggerProps = ReactPrimitivePartProps<MenuController['parts']['submenuTrigger'], 'div', true>;
export const MenuSubmenuTrigger = React.forwardRef<React.ElementRef<'div'>, MenuSubmenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="submenuTrigger" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuSubmenuTrigger.displayName = 'MenuSubmenuTrigger';

export type MenuSubmenuContentProps = ReactPrimitivePartProps<MenuController['parts']['submenuContent'], 'div', true>;
export const MenuSubmenuContent = React.forwardRef<React.ElementRef<'div'>, MenuSubmenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={MenuDefinition as never} part="submenuContent" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MenuSubmenuContent.displayName = 'MenuSubmenuContent';

export const MenuProvider = MenuRoot;
export function useMenu(inputs: MenuProps = {} as MenuProps): ReactPrimitiveHookResult<MenuController['state'], MenuController['actions']> {
  return useReactPrimitive(MenuDefinition, inputs) as ReactPrimitiveHookResult<MenuController['state'], MenuController['actions']>;
}
export const Menu = Object.assign(MenuRoot, { Provider: MenuProvider, Root: MenuRoot, Trigger: MenuTrigger, Positioner: MenuPositioner, Content: MenuContent, Item: MenuItem, ItemIndicator: MenuItemIndicator, Separator: MenuSeparator, Group: MenuGroup, GroupLabel: MenuGroupLabel, SubmenuTrigger: MenuSubmenuTrigger, SubmenuContent: MenuSubmenuContent });
