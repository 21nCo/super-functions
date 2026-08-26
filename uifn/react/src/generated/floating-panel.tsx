'use client';

import * as React from 'react';
import { createFloatingPanelController, type FloatingPanelProps, type FloatingPanelController } from '@uifn/core/primitives/floating-panel';
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

const FloatingPanelContext = React.createContext<ReactPrimitiveBridge<FloatingPanelProps> | null>(null);
const FloatingPanelDefinition: ReactPrimitiveDefinition<FloatingPanelProps> = {
  name: 'FloatingPanel',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","placement","draggable","resizable"],
  context: FloatingPanelContext,
  createController: createFloatingPanelController as never,
};

export type FloatingPanelRootProps = ReactPrimitiveRootProps<FloatingPanelProps, 'div'>;
export const FloatingPanelRoot = React.forwardRef<React.ElementRef<'div'>, FloatingPanelRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={FloatingPanelDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelRoot.displayName = 'FloatingPanelRoot';

export type FloatingPanelTriggerProps = ReactPrimitivePartProps<FloatingPanelController['parts']['trigger'], 'button', false>;
export const FloatingPanelTrigger = React.forwardRef<React.ElementRef<'button'>, FloatingPanelTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelTrigger.displayName = 'FloatingPanelTrigger';

export type FloatingPanelPositionerProps = ReactPrimitivePartProps<FloatingPanelController['parts']['positioner'], 'div', false>;
export const FloatingPanelPositioner = React.forwardRef<React.ElementRef<'div'>, FloatingPanelPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelPositioner.displayName = 'FloatingPanelPositioner';

export type FloatingPanelContentProps = ReactPrimitivePartProps<FloatingPanelController['parts']['content'], 'div', false>;
export const FloatingPanelContent = React.forwardRef<React.ElementRef<'div'>, FloatingPanelContentProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelContent.displayName = 'FloatingPanelContent';

export type FloatingPanelHeaderProps = ReactPrimitivePartProps<FloatingPanelController['parts']['header'], 'div', false>;
export const FloatingPanelHeader = React.forwardRef<React.ElementRef<'div'>, FloatingPanelHeaderProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="header" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelHeader.displayName = 'FloatingPanelHeader';

export type FloatingPanelTitleProps = ReactPrimitivePartProps<FloatingPanelController['parts']['title'], 'h2', false>;
export const FloatingPanelTitle = React.forwardRef<React.ElementRef<'h2'>, FloatingPanelTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelTitle.displayName = 'FloatingPanelTitle';

export type FloatingPanelDescriptionProps = ReactPrimitivePartProps<FloatingPanelController['parts']['description'], 'p', false>;
export const FloatingPanelDescription = React.forwardRef<React.ElementRef<'p'>, FloatingPanelDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelDescription.displayName = 'FloatingPanelDescription';

export type FloatingPanelDragHandleProps = ReactPrimitivePartProps<FloatingPanelController['parts']['dragHandle'], 'div', false>;
export const FloatingPanelDragHandle = React.forwardRef<React.ElementRef<'div'>, FloatingPanelDragHandleProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="dragHandle" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelDragHandle.displayName = 'FloatingPanelDragHandle';

export type FloatingPanelResizeHandleProps = ReactPrimitivePartProps<FloatingPanelController['parts']['resizeHandle'], 'div', true>;
export const FloatingPanelResizeHandle = React.forwardRef<React.ElementRef<'div'>, FloatingPanelResizeHandleProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="resizeHandle" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelResizeHandle.displayName = 'FloatingPanelResizeHandle';

export type FloatingPanelCloseProps = ReactPrimitivePartProps<FloatingPanelController['parts']['close'], 'button', false>;
export const FloatingPanelClose = React.forwardRef<React.ElementRef<'button'>, FloatingPanelCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={FloatingPanelDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FloatingPanelClose.displayName = 'FloatingPanelClose';

export const FloatingPanelProvider = FloatingPanelRoot;
export function useFloatingPanel(inputs: FloatingPanelProps = {} as FloatingPanelProps): ReactPrimitiveHookResult<FloatingPanelController['state'], FloatingPanelController['actions']> {
  return useReactPrimitive(FloatingPanelDefinition, inputs) as ReactPrimitiveHookResult<FloatingPanelController['state'], FloatingPanelController['actions']>;
}
export const FloatingPanel = Object.assign(FloatingPanelRoot, { Provider: FloatingPanelProvider, Root: FloatingPanelRoot, Trigger: FloatingPanelTrigger, Positioner: FloatingPanelPositioner, Content: FloatingPanelContent, Header: FloatingPanelHeader, Title: FloatingPanelTitle, Description: FloatingPanelDescription, DragHandle: FloatingPanelDragHandle, ResizeHandle: FloatingPanelResizeHandle, Close: FloatingPanelClose });
