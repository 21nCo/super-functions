import { createContext, type JSX } from 'solid-js';
import { createDialogController, type DialogProps, type DialogController } from '@uifn/core/primitives/dialog';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const DialogContext = createContext<SolidPrimitiveContextValue<DialogProps>>();
export const DialogDefinition: SolidPrimitiveDefinition<DialogProps> = {
  name: 'Dialog',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","initialFocus","restoreFocus"],
  context: DialogContext,
  createController: createDialogController as never,
};

function DialogRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DialogRootProps = SolidPrimitiveRootProps<DialogProps, 'div'>;
export function DialogRoot(props: DialogRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={DialogDefinition} element="div" renderElement={DialogRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function DialogTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DialogTriggerProps = SolidPrimitivePartProps<DialogController['parts']['trigger'], 'button', false>;
export function DialogTrigger(props: DialogTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="trigger"
      element="button"
      renderElement={DialogTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogPortalElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DialogPortalProps = SolidPrimitivePartProps<DialogController['parts']['portal'], 'div', false>;
export function DialogPortal(props: DialogPortalProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="portal"
      element="div"
      renderElement={DialogPortalElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogBackdropElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DialogBackdropProps = SolidPrimitivePartProps<DialogController['parts']['backdrop'], 'div', false>;
export function DialogBackdrop(props: DialogBackdropProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="backdrop"
      element="div"
      renderElement={DialogBackdropElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DialogPositionerProps = SolidPrimitivePartProps<DialogController['parts']['positioner'], 'div', false>;
export function DialogPositioner(props: DialogPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="positioner"
      element="div"
      renderElement={DialogPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DialogContentProps = SolidPrimitivePartProps<DialogController['parts']['content'], 'div', false>;
export function DialogContent(props: DialogContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="content"
      element="div"
      renderElement={DialogContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type DialogTitleProps = SolidPrimitivePartProps<DialogController['parts']['title'], 'h2', false>;
export function DialogTitle(props: DialogTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="title"
      element="h2"
      renderElement={DialogTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type DialogDescriptionProps = SolidPrimitivePartProps<DialogController['parts']['description'], 'p', false>;
export function DialogDescription(props: DialogDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="description"
      element="p"
      renderElement={DialogDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DialogCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DialogCloseProps = SolidPrimitivePartProps<DialogController['parts']['close'], 'button', false>;
export function DialogClose(props: DialogCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DialogDefinition as never}
      part="close"
      element="button"
      renderElement={DialogCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const DialogProvider = DialogRoot;
export const Dialog = /* @__PURE__ */ Object.assign(DialogRoot, { Provider: DialogProvider, Root: DialogRoot, Trigger: DialogTrigger, Portal: DialogPortal, Backdrop: DialogBackdrop, Positioner: DialogPositioner, Content: DialogContent, Title: DialogTitle, Description: DialogDescription, Close: DialogClose });
