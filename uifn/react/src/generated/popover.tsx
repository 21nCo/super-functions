'use client';

import * as React from 'react';
import { createPopoverController, type PopoverProps, type PopoverController } from '@uifn/core/primitives/popover';
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

const PopoverContext = React.createContext<ReactPrimitiveBridge<PopoverProps> | null>(null);
const PopoverDefinition: ReactPrimitiveDefinition<PopoverProps> = {
  name: 'Popover',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","placement","closeOnEscape","closeOnInteractOutside"],
  context: PopoverContext,
  createController: createPopoverController as never,
};

export type PopoverRootProps = ReactPrimitiveRootProps<PopoverProps, 'div'>;
export const PopoverRoot = React.forwardRef<React.ElementRef<'div'>, PopoverRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={PopoverDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverRoot.displayName = 'PopoverRoot';

export type PopoverAnchorProps = ReactPrimitivePartProps<PopoverController['parts']['anchor'], 'div', false>;
export const PopoverAnchor = React.forwardRef<React.ElementRef<'div'>, PopoverAnchorProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="anchor" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverAnchor.displayName = 'PopoverAnchor';

export type PopoverTriggerProps = ReactPrimitivePartProps<PopoverController['parts']['trigger'], 'button', false>;
export const PopoverTrigger = React.forwardRef<React.ElementRef<'button'>, PopoverTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverTrigger.displayName = 'PopoverTrigger';

export type PopoverPositionerProps = ReactPrimitivePartProps<PopoverController['parts']['positioner'], 'div', false>;
export const PopoverPositioner = React.forwardRef<React.ElementRef<'div'>, PopoverPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverPositioner.displayName = 'PopoverPositioner';

export type PopoverContentProps = ReactPrimitivePartProps<PopoverController['parts']['content'], 'div', false>;
export const PopoverContent = React.forwardRef<React.ElementRef<'div'>, PopoverContentProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverContent.displayName = 'PopoverContent';

export type PopoverTitleProps = ReactPrimitivePartProps<PopoverController['parts']['title'], 'h2', false>;
export const PopoverTitle = React.forwardRef<React.ElementRef<'h2'>, PopoverTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverTitle.displayName = 'PopoverTitle';

export type PopoverDescriptionProps = ReactPrimitivePartProps<PopoverController['parts']['description'], 'p', false>;
export const PopoverDescription = React.forwardRef<React.ElementRef<'p'>, PopoverDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverDescription.displayName = 'PopoverDescription';

export type PopoverArrowProps = ReactPrimitivePartProps<PopoverController['parts']['arrow'], 'div', false>;
export const PopoverArrow = React.forwardRef<React.ElementRef<'div'>, PopoverArrowProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="arrow" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverArrow.displayName = 'PopoverArrow';

export type PopoverCloseProps = ReactPrimitivePartProps<PopoverController['parts']['close'], 'button', false>;
export const PopoverClose = React.forwardRef<React.ElementRef<'button'>, PopoverCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={PopoverDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
PopoverClose.displayName = 'PopoverClose';

export const PopoverProvider = PopoverRoot;
export function usePopover(inputs: PopoverProps = {} as PopoverProps): ReactPrimitiveHookResult<PopoverController['state'], PopoverController['actions']> {
  return useReactPrimitive(PopoverDefinition, inputs) as ReactPrimitiveHookResult<PopoverController['state'], PopoverController['actions']>;
}
export const Popover = Object.assign(PopoverRoot, { Provider: PopoverProvider, Root: PopoverRoot, Anchor: PopoverAnchor, Trigger: PopoverTrigger, Positioner: PopoverPositioner, Content: PopoverContent, Title: PopoverTitle, Description: PopoverDescription, Arrow: PopoverArrow, Close: PopoverClose });
