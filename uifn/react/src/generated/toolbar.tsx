'use client';

import * as React from 'react';
import { createToolbarController, type ToolbarProps, type ToolbarController } from '@uifn/core/primitives/toolbar';
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

const ToolbarContext = React.createContext<ReactPrimitiveBridge<ToolbarProps> | null>(null);
const ToolbarDefinition: ReactPrimitiveDefinition<ToolbarProps> = {
  name: 'Toolbar',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["orientation","loop","dir","disabled"],
  context: ToolbarContext,
  createController: createToolbarController as never,
};

export type ToolbarRootProps = ReactPrimitiveRootProps<ToolbarProps, 'div'>;
export const ToolbarRoot = React.forwardRef<React.ElementRef<'div'>, ToolbarRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ToolbarDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToolbarRoot.displayName = 'ToolbarRoot';

export type ToolbarButtonProps = ReactPrimitivePartProps<ToolbarController['parts']['button'], 'button', true>;
export const ToolbarButton = React.forwardRef<React.ElementRef<'button'>, ToolbarButtonProps>((props, ref) => (
  <ReactPrimitivePart definition={ToolbarDefinition as never} part="button" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToolbarButton.displayName = 'ToolbarButton';

export type ToolbarLinkProps = ReactPrimitivePartProps<ToolbarController['parts']['link'], 'a', true>;
export const ToolbarLink = React.forwardRef<React.ElementRef<'a'>, ToolbarLinkProps>((props, ref) => (
  <ReactPrimitivePart definition={ToolbarDefinition as never} part="link" element="a" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToolbarLink.displayName = 'ToolbarLink';

export type ToolbarToggleGroupProps = ReactPrimitivePartProps<ToolbarController['parts']['toggleGroup'], 'div', true>;
export const ToolbarToggleGroup = React.forwardRef<React.ElementRef<'div'>, ToolbarToggleGroupProps>((props, ref) => (
  <ReactPrimitivePart definition={ToolbarDefinition as never} part="toggleGroup" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToolbarToggleGroup.displayName = 'ToolbarToggleGroup';

export type ToolbarSeparatorProps = ReactPrimitivePartProps<ToolbarController['parts']['separator'], 'div', true>;
export const ToolbarSeparator = React.forwardRef<React.ElementRef<'div'>, ToolbarSeparatorProps>((props, ref) => (
  <ReactPrimitivePart definition={ToolbarDefinition as never} part="separator" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToolbarSeparator.displayName = 'ToolbarSeparator';

export const ToolbarProvider = ToolbarRoot;
export function useToolbar(inputs: ToolbarProps = {} as ToolbarProps): ReactPrimitiveHookResult<ToolbarController['state'], ToolbarController['actions']> {
  return useReactPrimitive(ToolbarDefinition, inputs) as ReactPrimitiveHookResult<ToolbarController['state'], ToolbarController['actions']>;
}
export const Toolbar = Object.assign(ToolbarRoot, { Provider: ToolbarProvider, Root: ToolbarRoot, Button: ToolbarButton, Link: ToolbarLink, ToggleGroup: ToolbarToggleGroup, Separator: ToolbarSeparator });
