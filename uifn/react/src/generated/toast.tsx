'use client';

import * as React from 'react';
import { createToastController, type ToastProps, type ToastController } from '@uifn/core/primitives/toast';
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

const ToastContext = React.createContext<ReactPrimitiveBridge<ToastProps> | null>(null);
const ToastDefinition: ReactPrimitiveDefinition<ToastProps> = {
  name: 'Toast',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'viewport',
  inputNames: ["toasts","limit","duration","placement","pauseOnHover","pauseOnFocus","duplicatePolicy","messages","onDismiss","onRemove","onAnnounce"],
  context: ToastContext,
  createController: createToastController as never,
};

export type ToastViewportProps = ReactPrimitiveRootProps<ToastProps, 'div'>;
export const ToastViewport = React.forwardRef<React.ElementRef<'div'>, ToastViewportProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ToastDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastViewport.displayName = 'ToastViewport';

export type ToastRootProps = ReactPrimitivePartProps<ToastController['parts']['root'], 'div', true>;
export const ToastRoot = React.forwardRef<React.ElementRef<'div'>, ToastRootProps>((props, ref) => (
  <ReactPrimitivePart definition={ToastDefinition as never} part="root" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastRoot.displayName = 'ToastRoot';

export type ToastTitleProps = ReactPrimitivePartProps<ToastController['parts']['title'], 'div', true>;
export const ToastTitle = React.forwardRef<React.ElementRef<'div'>, ToastTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={ToastDefinition as never} part="title" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastTitle.displayName = 'ToastTitle';

export type ToastDescriptionProps = ReactPrimitivePartProps<ToastController['parts']['description'], 'div', true>;
export const ToastDescription = React.forwardRef<React.ElementRef<'div'>, ToastDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={ToastDefinition as never} part="description" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastDescription.displayName = 'ToastDescription';

export type ToastActionProps = ReactPrimitivePartProps<ToastController['parts']['action'], 'button', true>;
export const ToastAction = React.forwardRef<React.ElementRef<'button'>, ToastActionProps>((props, ref) => (
  <ReactPrimitivePart definition={ToastDefinition as never} part="action" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastAction.displayName = 'ToastAction';

export type ToastCloseProps = ReactPrimitivePartProps<ToastController['parts']['close'], 'button', true>;
export const ToastClose = React.forwardRef<React.ElementRef<'button'>, ToastCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={ToastDefinition as never} part="close" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ToastClose.displayName = 'ToastClose';

export const ToastProvider = ToastViewport;
export function useToast(inputs: ToastProps = {} as ToastProps): ReactPrimitiveHookResult<ToastController['state'], ToastController['actions']> {
  return useReactPrimitive(ToastDefinition, inputs) as ReactPrimitiveHookResult<ToastController['state'], ToastController['actions']>;
}
export const Toast = Object.assign(ToastViewport, { Provider: ToastProvider, Viewport: ToastViewport, Root: ToastRoot, Title: ToastTitle, Description: ToastDescription, Action: ToastAction, Close: ToastClose });
