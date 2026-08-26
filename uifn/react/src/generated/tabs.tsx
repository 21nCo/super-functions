'use client';

import * as React from 'react';
import { createTabsController, type TabsProps, type TabsController } from '@uifn/core/primitives/tabs';
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

const TabsContext = React.createContext<ReactPrimitiveBridge<TabsProps> | null>(null);
const TabsDefinition: ReactPrimitiveDefinition<TabsProps> = {
  name: 'Tabs',
  family: 'menu-navigation',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","activationMode","orientation","loop","dir"],
  context: TabsContext,
  createController: createTabsController as never,
};

export type TabsRootProps = ReactPrimitiveRootProps<TabsProps, 'div'>;
export const TabsRoot = React.forwardRef<React.ElementRef<'div'>, TabsRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TabsDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TabsRoot.displayName = 'TabsRoot';

export type TabsListProps = ReactPrimitivePartProps<TabsController['parts']['list'], 'div', false>;
export const TabsList = React.forwardRef<React.ElementRef<'div'>, TabsListProps>((props, ref) => (
  <ReactPrimitivePart definition={TabsDefinition as never} part="list" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TabsList.displayName = 'TabsList';

export type TabsTriggerProps = ReactPrimitivePartProps<TabsController['parts']['trigger'], 'button', true>;
export const TabsTrigger = React.forwardRef<React.ElementRef<'button'>, TabsTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={TabsDefinition as never} part="trigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TabsTrigger.displayName = 'TabsTrigger';

export type TabsContentProps = ReactPrimitivePartProps<TabsController['parts']['content'], 'div', true>;
export const TabsContent = React.forwardRef<React.ElementRef<'div'>, TabsContentProps>((props, ref) => (
  <ReactPrimitivePart definition={TabsDefinition as never} part="content" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TabsContent.displayName = 'TabsContent';

export type TabsIndicatorProps = ReactPrimitivePartProps<TabsController['parts']['indicator'], 'div', false>;
export const TabsIndicator = React.forwardRef<React.ElementRef<'div'>, TabsIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={TabsDefinition as never} part="indicator" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TabsIndicator.displayName = 'TabsIndicator';

export const TabsProvider = TabsRoot;
export function useTabs(inputs: TabsProps = {} as TabsProps): ReactPrimitiveHookResult<TabsController['state'], TabsController['actions']> {
  return useReactPrimitive(TabsDefinition, inputs) as ReactPrimitiveHookResult<TabsController['state'], TabsController['actions']>;
}
export const Tabs = Object.assign(TabsRoot, { Provider: TabsProvider, Root: TabsRoot, List: TabsList, Trigger: TabsTrigger, Content: TabsContent, Indicator: TabsIndicator });
