'use client';

import * as React from 'react';
import { createTooltipController, type TooltipProps, type TooltipController } from '@uifn/core/primitives/tooltip';
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

const TooltipContext = React.createContext<ReactPrimitiveBridge<TooltipProps> | null>(null);
const TooltipDefinition: ReactPrimitiveDefinition<TooltipProps> = {
  name: 'Tooltip',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","openDelay","closeDelay","placement","disabled"],
  context: TooltipContext,
  createController: createTooltipController as never,
};

export type TooltipRootProps = ReactPrimitiveRootProps<TooltipProps, 'span'>;
export const TooltipRoot = React.forwardRef<React.ElementRef<'span'>, TooltipRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TooltipDefinition} element="span" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TooltipRoot.displayName = 'TooltipRoot';

export type TooltipTriggerProps = ReactPrimitivePartProps<TooltipController['parts']['trigger'], 'button', false>;
export const TooltipTrigger = React.forwardRef<React.ElementRef<'button'>, TooltipTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={TooltipDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TooltipTrigger.displayName = 'TooltipTrigger';

export type TooltipPositionerProps = ReactPrimitivePartProps<TooltipController['parts']['positioner'], 'div', false>;
export const TooltipPositioner = React.forwardRef<React.ElementRef<'div'>, TooltipPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={TooltipDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TooltipPositioner.displayName = 'TooltipPositioner';

export type TooltipContentProps = ReactPrimitivePartProps<TooltipController['parts']['content'], 'div', false>;
export const TooltipContent = React.forwardRef<React.ElementRef<'div'>, TooltipContentProps>((props, ref) => (
  <ReactPrimitivePart definition={TooltipDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TooltipContent.displayName = 'TooltipContent';

export type TooltipArrowProps = ReactPrimitivePartProps<TooltipController['parts']['arrow'], 'div', false>;
export const TooltipArrow = React.forwardRef<React.ElementRef<'div'>, TooltipArrowProps>((props, ref) => (
  <ReactPrimitivePart definition={TooltipDefinition as never} part="arrow" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TooltipArrow.displayName = 'TooltipArrow';

export const TooltipProvider = TooltipRoot;
export function useTooltip(inputs: TooltipProps = {} as TooltipProps): ReactPrimitiveHookResult<TooltipController['state'], TooltipController['actions']> {
  return useReactPrimitive(TooltipDefinition, inputs) as ReactPrimitiveHookResult<TooltipController['state'], TooltipController['actions']>;
}
export const Tooltip = Object.assign(TooltipRoot, { Provider: TooltipProvider, Root: TooltipRoot, Trigger: TooltipTrigger, Positioner: TooltipPositioner, Content: TooltipContent, Arrow: TooltipArrow });
