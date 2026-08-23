'use client';

import * as React from 'react';
import { createCollapsibleController, type CollapsibleProps, type CollapsibleController } from '@uifn/core/primitives/collapsible';
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

const CollapsibleContext = React.createContext<ReactPrimitiveBridge<CollapsibleProps> | null>(null);
const CollapsibleDefinition: ReactPrimitiveDefinition<CollapsibleProps> = {
  name: 'Collapsible',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","disabled"],
  context: CollapsibleContext,
  createController: createCollapsibleController as never,
};

export type CollapsibleRootProps = ReactPrimitiveRootProps<CollapsibleProps, 'div'>;
export const CollapsibleRoot = React.forwardRef<React.ElementRef<'div'>, CollapsibleRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CollapsibleDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CollapsibleRoot.displayName = 'CollapsibleRoot';

export type CollapsibleTriggerProps = ReactPrimitivePartProps<CollapsibleController['parts']['trigger'], 'button', false>;
export const CollapsibleTrigger = React.forwardRef<React.ElementRef<'button'>, CollapsibleTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={CollapsibleDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CollapsibleTrigger.displayName = 'CollapsibleTrigger';

export type CollapsibleContentProps = ReactPrimitivePartProps<CollapsibleController['parts']['content'], 'div', false>;
export const CollapsibleContent = React.forwardRef<React.ElementRef<'div'>, CollapsibleContentProps>((props, ref) => (
  <ReactPrimitivePart definition={CollapsibleDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CollapsibleContent.displayName = 'CollapsibleContent';

export const CollapsibleProvider = CollapsibleRoot;
export function useCollapsible(inputs: CollapsibleProps = {} as CollapsibleProps): ReactPrimitiveHookResult<CollapsibleController['state'], CollapsibleController['actions']> {
  return useReactPrimitive(CollapsibleDefinition, inputs) as ReactPrimitiveHookResult<CollapsibleController['state'], CollapsibleController['actions']>;
}
export const Collapsible = Object.assign(CollapsibleRoot, { Provider: CollapsibleProvider, Root: CollapsibleRoot, Trigger: CollapsibleTrigger, Content: CollapsibleContent });
