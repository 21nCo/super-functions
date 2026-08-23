'use client';

import * as React from 'react';
import { createContextMenuController, type ContextMenuProps, type ContextMenuController } from '@uifn/core/primitives/context-menu';
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

const ContextMenuContext = React.createContext<ReactPrimitiveBridge<ContextMenuProps> | null>(null);
const ContextMenuDefinition: ReactPrimitiveDefinition<ContextMenuProps> = {
  name: 'ContextMenu',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","dir","loop"],
  context: ContextMenuContext,
  createController: createContextMenuController as never,
};

export type ContextMenuRootProps = ReactPrimitiveRootProps<ContextMenuProps, 'div'>;
export const ContextMenuRoot = React.forwardRef<React.ElementRef<'div'>, ContextMenuRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ContextMenuDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuRoot.displayName = 'ContextMenuRoot';

export type ContextMenuTriggerProps = ReactPrimitivePartProps<ContextMenuController['parts']['trigger'], 'div', false>;
export const ContextMenuTrigger = React.forwardRef<React.ElementRef<'div'>, ContextMenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="trigger" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuTrigger.displayName = 'ContextMenuTrigger';

export type ContextMenuPositionerProps = ReactPrimitivePartProps<ContextMenuController['parts']['positioner'], 'div', false>;
export const ContextMenuPositioner = React.forwardRef<React.ElementRef<'div'>, ContextMenuPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuPositioner.displayName = 'ContextMenuPositioner';

export type ContextMenuContentProps = ReactPrimitivePartProps<ContextMenuController['parts']['content'], 'div', false>;
export const ContextMenuContent = React.forwardRef<React.ElementRef<'div'>, ContextMenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuContent.displayName = 'ContextMenuContent';

export type ContextMenuItemProps = ReactPrimitivePartProps<ContextMenuController['parts']['item'], 'div', true>;
export const ContextMenuItem = React.forwardRef<React.ElementRef<'div'>, ContextMenuItemProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuItem.displayName = 'ContextMenuItem';

export type ContextMenuItemIndicatorProps = ReactPrimitivePartProps<ContextMenuController['parts']['itemIndicator'], 'span', true>;
export const ContextMenuItemIndicator = React.forwardRef<React.ElementRef<'span'>, ContextMenuItemIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="itemIndicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuItemIndicator.displayName = 'ContextMenuItemIndicator';

export type ContextMenuSeparatorProps = ReactPrimitivePartProps<ContextMenuController['parts']['separator'], 'div', true>;
export const ContextMenuSeparator = React.forwardRef<React.ElementRef<'div'>, ContextMenuSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="separator" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuSeparator.displayName = 'ContextMenuSeparator';

export type ContextMenuGroupProps = ReactPrimitivePartProps<ContextMenuController['parts']['group'], 'div', true>;
export const ContextMenuGroup = React.forwardRef<React.ElementRef<'div'>, ContextMenuGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="group" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuGroup.displayName = 'ContextMenuGroup';

export type ContextMenuGroupLabelProps = ReactPrimitivePartProps<ContextMenuController['parts']['groupLabel'], 'div', true>;
export const ContextMenuGroupLabel = React.forwardRef<React.ElementRef<'div'>, ContextMenuGroupLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="groupLabel" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuGroupLabel.displayName = 'ContextMenuGroupLabel';

export type ContextMenuSubmenuTriggerProps = ReactPrimitivePartProps<ContextMenuController['parts']['submenuTrigger'], 'div', true>;
export const ContextMenuSubmenuTrigger = React.forwardRef<React.ElementRef<'div'>, ContextMenuSubmenuTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="submenuTrigger" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuSubmenuTrigger.displayName = 'ContextMenuSubmenuTrigger';

export type ContextMenuSubmenuContentProps = ReactPrimitivePartProps<ContextMenuController['parts']['submenuContent'], 'div', true>;
export const ContextMenuSubmenuContent = React.forwardRef<React.ElementRef<'div'>, ContextMenuSubmenuContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ContextMenuDefinition as never} part="submenuContent" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ContextMenuSubmenuContent.displayName = 'ContextMenuSubmenuContent';

export const ContextMenuProvider = ContextMenuRoot;
export function useContextMenu(inputs: ContextMenuProps = {} as ContextMenuProps): ReactPrimitiveHookResult<ContextMenuController['state'], ContextMenuController['actions']> {
  return useReactPrimitive(ContextMenuDefinition, inputs) as ReactPrimitiveHookResult<ContextMenuController['state'], ContextMenuController['actions']>;
}
export const ContextMenu = Object.assign(ContextMenuRoot, { Provider: ContextMenuProvider, Root: ContextMenuRoot, Trigger: ContextMenuTrigger, Positioner: ContextMenuPositioner, Content: ContextMenuContent, Item: ContextMenuItem, ItemIndicator: ContextMenuItemIndicator, Separator: ContextMenuSeparator, Group: ContextMenuGroup, GroupLabel: ContextMenuGroupLabel, SubmenuTrigger: ContextMenuSubmenuTrigger, SubmenuContent: ContextMenuSubmenuContent });
