'use client';

import * as React from 'react';
import { createHoverCardController, type CreateHoverCardProps, type HoverCardController } from '@uifn/core/primitives/hover-card';
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

const HoverCardContext = React.createContext<ReactPrimitiveBridge<CreateHoverCardProps> | null>(null);
const HoverCardDefinition: ReactPrimitiveDefinition<CreateHoverCardProps> = {
  name: 'HoverCard',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","openDelay","closeDelay","placement"],
  context: HoverCardContext,
  createController: createHoverCardController as never,
};

export type HoverCardRootProps = ReactPrimitiveRootProps<CreateHoverCardProps, 'div'>;
export const HoverCardRoot = React.forwardRef<React.ElementRef<'div'>, HoverCardRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={HoverCardDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
HoverCardRoot.displayName = 'HoverCardRoot';

export type HoverCardTriggerProps = ReactPrimitivePartProps<HoverCardController['parts']['trigger'], 'a', false>;
export const HoverCardTrigger = React.forwardRef<React.ElementRef<'a'>, HoverCardTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={HoverCardDefinition as never} part="trigger" element="a" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
HoverCardTrigger.displayName = 'HoverCardTrigger';

export type HoverCardPositionerProps = ReactPrimitivePartProps<HoverCardController['parts']['positioner'], 'div', false>;
export const HoverCardPositioner = React.forwardRef<React.ElementRef<'div'>, HoverCardPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={HoverCardDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
HoverCardPositioner.displayName = 'HoverCardPositioner';

export type HoverCardContentProps = ReactPrimitivePartProps<HoverCardController['parts']['content'], 'div', false>;
export const HoverCardContent = React.forwardRef<React.ElementRef<'div'>, HoverCardContentProps>((props, ref) => (
  <ReactPrimitivePart definition={HoverCardDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
HoverCardContent.displayName = 'HoverCardContent';

export type HoverCardArrowProps = ReactPrimitivePartProps<HoverCardController['parts']['arrow'], 'div', false>;
export const HoverCardArrow = React.forwardRef<React.ElementRef<'div'>, HoverCardArrowProps>((props, ref) => (
  <ReactPrimitivePart definition={HoverCardDefinition as never} part="arrow" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
HoverCardArrow.displayName = 'HoverCardArrow';

export const HoverCardProvider = HoverCardRoot;
export function useHoverCard(inputs: CreateHoverCardProps = {} as CreateHoverCardProps): ReactPrimitiveHookResult<HoverCardController['state'], HoverCardController['actions']> {
  return useReactPrimitive(HoverCardDefinition, inputs) as ReactPrimitiveHookResult<HoverCardController['state'], HoverCardController['actions']>;
}
export const HoverCard = Object.assign(HoverCardRoot, { Provider: HoverCardProvider, Root: HoverCardRoot, Trigger: HoverCardTrigger, Positioner: HoverCardPositioner, Content: HoverCardContent, Arrow: HoverCardArrow });
