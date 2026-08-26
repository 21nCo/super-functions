'use client';

import * as React from 'react';
import { createAlertDialogController, type AlertDialogProps, type AlertDialogController } from '@uifn/core/primitives/alert-dialog';
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

const AlertDialogContext = React.createContext<ReactPrimitiveBridge<AlertDialogProps> | null>(null);
const AlertDialogDefinition: ReactPrimitiveDefinition<AlertDialogProps> = {
  name: 'AlertDialog',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","initialFocus","restoreFocus"],
  context: AlertDialogContext,
  createController: createAlertDialogController as never,
};

export type AlertDialogRootProps = ReactPrimitiveRootProps<AlertDialogProps, 'div'>;
export const AlertDialogRoot = React.forwardRef<React.ElementRef<'div'>, AlertDialogRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={AlertDialogDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogRoot.displayName = 'AlertDialogRoot';

export type AlertDialogTriggerProps = ReactPrimitivePartProps<AlertDialogController['parts']['trigger'], 'button', false>;
export const AlertDialogTrigger = React.forwardRef<React.ElementRef<'button'>, AlertDialogTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogTrigger.displayName = 'AlertDialogTrigger';

export type AlertDialogPortalProps = ReactPrimitivePartProps<AlertDialogController['parts']['portal'], 'div', false>;
export const AlertDialogPortal = React.forwardRef<React.ElementRef<'div'>, AlertDialogPortalProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="portal" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogPortal.displayName = 'AlertDialogPortal';

export type AlertDialogBackdropProps = ReactPrimitivePartProps<AlertDialogController['parts']['backdrop'], 'div', false>;
export const AlertDialogBackdrop = React.forwardRef<React.ElementRef<'div'>, AlertDialogBackdropProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="backdrop" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogBackdrop.displayName = 'AlertDialogBackdrop';

export type AlertDialogPositionerProps = ReactPrimitivePartProps<AlertDialogController['parts']['positioner'], 'div', false>;
export const AlertDialogPositioner = React.forwardRef<React.ElementRef<'div'>, AlertDialogPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogPositioner.displayName = 'AlertDialogPositioner';

export type AlertDialogContentProps = ReactPrimitivePartProps<AlertDialogController['parts']['content'], 'div', false>;
export const AlertDialogContent = React.forwardRef<React.ElementRef<'div'>, AlertDialogContentProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogContent.displayName = 'AlertDialogContent';

export type AlertDialogTitleProps = ReactPrimitivePartProps<AlertDialogController['parts']['title'], 'h2', false>;
export const AlertDialogTitle = React.forwardRef<React.ElementRef<'h2'>, AlertDialogTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogTitle.displayName = 'AlertDialogTitle';

export type AlertDialogDescriptionProps = ReactPrimitivePartProps<AlertDialogController['parts']['description'], 'p', false>;
export const AlertDialogDescription = React.forwardRef<React.ElementRef<'p'>, AlertDialogDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogDescription.displayName = 'AlertDialogDescription';

export type AlertDialogCancelProps = ReactPrimitivePartProps<AlertDialogController['parts']['cancel'], 'button', false>;
export const AlertDialogCancel = React.forwardRef<React.ElementRef<'button'>, AlertDialogCancelProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="cancel" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogCancel.displayName = 'AlertDialogCancel';

export type AlertDialogActionProps = ReactPrimitivePartProps<AlertDialogController['parts']['action'], 'button', false>;
export const AlertDialogAction = React.forwardRef<React.ElementRef<'button'>, AlertDialogActionProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="action" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogAction.displayName = 'AlertDialogAction';

export type AlertDialogCloseProps = ReactPrimitivePartProps<AlertDialogController['parts']['close'], 'button', false>;
export const AlertDialogClose = React.forwardRef<React.ElementRef<'button'>, AlertDialogCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={AlertDialogDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AlertDialogClose.displayName = 'AlertDialogClose';

export const AlertDialogProvider = AlertDialogRoot;
export function useAlertDialog(inputs: AlertDialogProps = {} as AlertDialogProps): ReactPrimitiveHookResult<AlertDialogController['state'], AlertDialogController['actions']> {
  return useReactPrimitive(AlertDialogDefinition, inputs) as ReactPrimitiveHookResult<AlertDialogController['state'], AlertDialogController['actions']>;
}
export const AlertDialog = Object.assign(AlertDialogRoot, { Provider: AlertDialogProvider, Root: AlertDialogRoot, Trigger: AlertDialogTrigger, Portal: AlertDialogPortal, Backdrop: AlertDialogBackdrop, Positioner: AlertDialogPositioner, Content: AlertDialogContent, Title: AlertDialogTitle, Description: AlertDialogDescription, Cancel: AlertDialogCancel, Action: AlertDialogAction, Close: AlertDialogClose });
