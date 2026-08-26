'use client';

import * as React from 'react';
import { createDialogController, type DialogProps, type DialogController } from '@uifn/core/primitives/dialog';
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

const DialogContext = React.createContext<ReactPrimitiveBridge<DialogProps> | null>(null);
const DialogDefinition: ReactPrimitiveDefinition<DialogProps> = {
  name: 'Dialog',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","initialFocus","restoreFocus"],
  context: DialogContext,
  createController: createDialogController as never,
};

export type DialogRootProps = ReactPrimitiveRootProps<DialogProps, 'div'>;
export const DialogRoot = React.forwardRef<React.ElementRef<'div'>, DialogRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={DialogDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogRoot.displayName = 'DialogRoot';

export type DialogTriggerProps = ReactPrimitivePartProps<DialogController['parts']['trigger'], 'button', false>;
export const DialogTrigger = React.forwardRef<React.ElementRef<'button'>, DialogTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="trigger" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogTrigger.displayName = 'DialogTrigger';

export type DialogPortalProps = ReactPrimitivePartProps<DialogController['parts']['portal'], 'div', false>;
export const DialogPortal = React.forwardRef<React.ElementRef<'div'>, DialogPortalProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="portal" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogPortal.displayName = 'DialogPortal';

export type DialogBackdropProps = ReactPrimitivePartProps<DialogController['parts']['backdrop'], 'div', false>;
export const DialogBackdrop = React.forwardRef<React.ElementRef<'div'>, DialogBackdropProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="backdrop" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogBackdrop.displayName = 'DialogBackdrop';

export type DialogPositionerProps = ReactPrimitivePartProps<DialogController['parts']['positioner'], 'div', false>;
export const DialogPositioner = React.forwardRef<React.ElementRef<'div'>, DialogPositionerProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="positioner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogPositioner.displayName = 'DialogPositioner';

export type DialogContentProps = ReactPrimitivePartProps<DialogController['parts']['content'], 'div', false>;
export const DialogContent = React.forwardRef<React.ElementRef<'div'>, DialogContentProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogContent.displayName = 'DialogContent';

export type DialogTitleProps = ReactPrimitivePartProps<DialogController['parts']['title'], 'h2', false>;
export const DialogTitle = React.forwardRef<React.ElementRef<'h2'>, DialogTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="title" element="h2" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogTitle.displayName = 'DialogTitle';

export type DialogDescriptionProps = ReactPrimitivePartProps<DialogController['parts']['description'], 'p', false>;
export const DialogDescription = React.forwardRef<React.ElementRef<'p'>, DialogDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogDescription.displayName = 'DialogDescription';

export type DialogCloseProps = ReactPrimitivePartProps<DialogController['parts']['close'], 'button', false>;
export const DialogClose = React.forwardRef<React.ElementRef<'button'>, DialogCloseProps>((props, ref) => (
  <ReactPrimitivePart definition={DialogDefinition as never} part="close" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
DialogClose.displayName = 'DialogClose';

export const DialogProvider = DialogRoot;
export function useDialog(inputs: DialogProps = {} as DialogProps): ReactPrimitiveHookResult<DialogController['state'], DialogController['actions']> {
  return useReactPrimitive(DialogDefinition, inputs) as ReactPrimitiveHookResult<DialogController['state'], DialogController['actions']>;
}
export const Dialog = Object.assign(DialogRoot, { Provider: DialogProvider, Root: DialogRoot, Trigger: DialogTrigger, Portal: DialogPortal, Backdrop: DialogBackdrop, Positioner: DialogPositioner, Content: DialogContent, Title: DialogTitle, Description: DialogDescription, Close: DialogClose });
