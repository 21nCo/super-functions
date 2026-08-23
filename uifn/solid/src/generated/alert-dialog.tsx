import { createContext, type JSX } from 'solid-js';
import { createAlertDialogController, type AlertDialogProps, type AlertDialogController } from '@uifn/core/primitives/alert-dialog';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const AlertDialogContext = createContext<SolidPrimitiveContextValue<AlertDialogProps>>();
export const AlertDialogDefinition: SolidPrimitiveDefinition<AlertDialogProps> = {
  name: 'AlertDialog',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","initialFocus","restoreFocus"],
  context: AlertDialogContext,
  createController: createAlertDialogController as never,
};

function AlertDialogRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AlertDialogRootProps = SolidPrimitiveRootProps<AlertDialogProps, 'div'>;
export function AlertDialogRoot(props: AlertDialogRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={AlertDialogDefinition} element="div" renderElement={AlertDialogRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function AlertDialogTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AlertDialogTriggerProps = SolidPrimitivePartProps<AlertDialogController['parts']['trigger'], 'button', false>;
export function AlertDialogTrigger(props: AlertDialogTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="trigger"
      element="button"
      renderElement={AlertDialogTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogPortalElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AlertDialogPortalProps = SolidPrimitivePartProps<AlertDialogController['parts']['portal'], 'div', false>;
export function AlertDialogPortal(props: AlertDialogPortalProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="portal"
      element="div"
      renderElement={AlertDialogPortalElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogBackdropElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AlertDialogBackdropProps = SolidPrimitivePartProps<AlertDialogController['parts']['backdrop'], 'div', false>;
export function AlertDialogBackdrop(props: AlertDialogBackdropProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="backdrop"
      element="div"
      renderElement={AlertDialogBackdropElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AlertDialogPositionerProps = SolidPrimitivePartProps<AlertDialogController['parts']['positioner'], 'div', false>;
export function AlertDialogPositioner(props: AlertDialogPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="positioner"
      element="div"
      renderElement={AlertDialogPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AlertDialogContentProps = SolidPrimitivePartProps<AlertDialogController['parts']['content'], 'div', false>;
export function AlertDialogContent(props: AlertDialogContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="content"
      element="div"
      renderElement={AlertDialogContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type AlertDialogTitleProps = SolidPrimitivePartProps<AlertDialogController['parts']['title'], 'h2', false>;
export function AlertDialogTitle(props: AlertDialogTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="title"
      element="h2"
      renderElement={AlertDialogTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type AlertDialogDescriptionProps = SolidPrimitivePartProps<AlertDialogController['parts']['description'], 'p', false>;
export function AlertDialogDescription(props: AlertDialogDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="description"
      element="p"
      renderElement={AlertDialogDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogCancelElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AlertDialogCancelProps = SolidPrimitivePartProps<AlertDialogController['parts']['cancel'], 'button', false>;
export function AlertDialogCancel(props: AlertDialogCancelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="cancel"
      element="button"
      renderElement={AlertDialogCancelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogActionElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AlertDialogActionProps = SolidPrimitivePartProps<AlertDialogController['parts']['action'], 'button', false>;
export function AlertDialogAction(props: AlertDialogActionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="action"
      element="button"
      renderElement={AlertDialogActionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AlertDialogCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AlertDialogCloseProps = SolidPrimitivePartProps<AlertDialogController['parts']['close'], 'button', false>;
export function AlertDialogClose(props: AlertDialogCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AlertDialogDefinition as never}
      part="close"
      element="button"
      renderElement={AlertDialogCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const AlertDialogProvider = AlertDialogRoot;
export const AlertDialog = /* @__PURE__ */ Object.assign(AlertDialogRoot, { Provider: AlertDialogProvider, Root: AlertDialogRoot, Trigger: AlertDialogTrigger, Portal: AlertDialogPortal, Backdrop: AlertDialogBackdrop, Positioner: AlertDialogPositioner, Content: AlertDialogContent, Title: AlertDialogTitle, Description: AlertDialogDescription, Cancel: AlertDialogCancel, Action: AlertDialogAction, Close: AlertDialogClose });
