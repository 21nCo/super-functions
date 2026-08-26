'use client';

import * as React from 'react';
import { createDrawerController, type DrawerProps, type DrawerController } from '@uifn/core/primitives/drawer';
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

const DrawerContext = React.createContext<ReactPrimitiveBridge<DrawerProps> | null>(null);
const DrawerDefinition: ReactPrimitiveDefinition<DrawerProps> = {
  name: 'Drawer',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","side","modal","dismissThreshold"],
  context: DrawerContext,
  createController: createDrawerController as never,
};

export type DrawerRootProps = ReactPrimitiveRootProps<DrawerProps, 'div'>;
export const DrawerRoot = React.forwardRef<React.ElementRef<'div'>, DrawerRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={DrawerDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerRoot.displayName = 'DrawerRoot';

export type DrawerTriggerProps = ReactPrimitivePartProps<DrawerController['parts']['trigger'], 'button', false>;
export const DrawerTrigger = React.forwardRef<React.ElementRef<'button'>, DrawerTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerTrigger.displayName = 'DrawerTrigger';

export type DrawerPortalProps = ReactPrimitivePartProps<DrawerController['parts']['portal'], 'div', false>;
export const DrawerPortal = React.forwardRef<React.ElementRef<'div'>, DrawerPortalProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="portal" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerPortal.displayName = 'DrawerPortal';

export type DrawerBackdropProps = ReactPrimitivePartProps<DrawerController['parts']['backdrop'], 'div', false>;
export const DrawerBackdrop = React.forwardRef<React.ElementRef<'div'>, DrawerBackdropProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="backdrop" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerBackdrop.displayName = 'DrawerBackdrop';

export type DrawerPositionerProps = ReactPrimitivePartProps<DrawerController['parts']['positioner'], 'div', false>;
export const DrawerPositioner = React.forwardRef<React.ElementRef<'div'>, DrawerPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerPositioner.displayName = 'DrawerPositioner';

export type DrawerContentProps = ReactPrimitivePartProps<DrawerController['parts']['content'], 'div', false>;
export const DrawerContent = React.forwardRef<React.ElementRef<'div'>, DrawerContentProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerContent.displayName = 'DrawerContent';

export type DrawerHandleProps = ReactPrimitivePartProps<DrawerController['parts']['handle'], 'div', false>;
export const DrawerHandle = React.forwardRef<React.ElementRef<'div'>, DrawerHandleProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="handle" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerHandle.displayName = 'DrawerHandle';

export type DrawerTitleProps = ReactPrimitivePartProps<DrawerController['parts']['title'], 'h2', false>;
export const DrawerTitle = React.forwardRef<React.ElementRef<'h2'>, DrawerTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerTitle.displayName = 'DrawerTitle';

export type DrawerDescriptionProps = ReactPrimitivePartProps<DrawerController['parts']['description'], 'p', false>;
export const DrawerDescription = React.forwardRef<React.ElementRef<'p'>, DrawerDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerDescription.displayName = 'DrawerDescription';

export type DrawerCloseProps = ReactPrimitivePartProps<DrawerController['parts']['close'], 'button', false>;
export const DrawerClose = React.forwardRef<React.ElementRef<'button'>, DrawerCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={DrawerDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DrawerClose.displayName = 'DrawerClose';

export const DrawerProvider = DrawerRoot;
export function useDrawer(inputs: DrawerProps = {} as DrawerProps): ReactPrimitiveHookResult<DrawerController['state'], DrawerController['actions']> {
  return useReactPrimitive(DrawerDefinition, inputs) as ReactPrimitiveHookResult<DrawerController['state'], DrawerController['actions']>;
}
export const Drawer = Object.assign(DrawerRoot, { Provider: DrawerProvider, Root: DrawerRoot, Trigger: DrawerTrigger, Portal: DrawerPortal, Backdrop: DrawerBackdrop, Positioner: DrawerPositioner, Content: DrawerContent, Handle: DrawerHandle, Title: DrawerTitle, Description: DrawerDescription, Close: DrawerClose });
