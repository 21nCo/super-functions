import { createContext, type JSX } from 'solid-js';
import { createToastController, type ToastProps, type ToastController } from '@uifn/core/primitives/toast';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ToastContext = createContext<SolidPrimitiveContextValue<ToastProps>>();
export const ToastDefinition: SolidPrimitiveDefinition<ToastProps> = {
  name: 'Toast',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'viewport',
  inputNames: ["toasts","limit","duration","placement","pauseOnHover","pauseOnFocus","duplicatePolicy","messages","onDismiss","onRemove","onAnnounce"],
  context: ToastContext,
  createController: createToastController as never,
};

function ToastViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToastViewportProps = SolidPrimitiveRootProps<ToastProps, 'div'>;
export function ToastViewport(props: ToastViewportProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ToastDefinition} element="div" renderElement={ToastViewportElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ToastRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToastRootProps = SolidPrimitivePartProps<ToastController['parts']['root'], 'div', true>;
export function ToastRoot(props: ToastRootProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToastDefinition as never}
      part="root"
      element="div"
      renderElement={ToastRootElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToastTitleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToastTitleProps = SolidPrimitivePartProps<ToastController['parts']['title'], 'div', true>;
export function ToastTitle(props: ToastTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToastDefinition as never}
      part="title"
      element="div"
      renderElement={ToastTitleElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToastDescriptionElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToastDescriptionProps = SolidPrimitivePartProps<ToastController['parts']['description'], 'div', true>;
export function ToastDescription(props: ToastDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToastDefinition as never}
      part="description"
      element="div"
      renderElement={ToastDescriptionElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToastActionElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ToastActionProps = SolidPrimitivePartProps<ToastController['parts']['action'], 'button', true>;
export function ToastAction(props: ToastActionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToastDefinition as never}
      part="action"
      element="button"
      renderElement={ToastActionElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ToastCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ToastCloseProps = SolidPrimitivePartProps<ToastController['parts']['close'], 'button', true>;
export function ToastClose(props: ToastCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToastDefinition as never}
      part="close"
      element="button"
      renderElement={ToastCloseElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const ToastProvider = ToastViewport;
export const Toast = /* @__PURE__ */ Object.assign(ToastViewport, { Provider: ToastProvider, Root: ToastRoot, Viewport: ToastViewport, Title: ToastTitle, Description: ToastDescription, Action: ToastAction, Close: ToastClose });
