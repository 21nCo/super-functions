import { createContext, type JSX } from 'solid-js';
import { createDrawerController, type DrawerProps, type DrawerController } from '@uifn/core/primitives/drawer';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const DrawerContext = createContext<SolidPrimitiveContextValue<DrawerProps>>();
export const DrawerDefinition: SolidPrimitiveDefinition<DrawerProps> = {
  name: 'Drawer',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","side","modal","dismissThreshold"],
  context: DrawerContext,
  createController: createDrawerController as never,
};

function DrawerRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerRootProps = SolidPrimitiveRootProps<DrawerProps, 'div'>;
export function DrawerRoot(props: DrawerRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={DrawerDefinition} element="div" renderElement={DrawerRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function DrawerTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DrawerTriggerProps = SolidPrimitivePartProps<DrawerController['parts']['trigger'], 'button', false>;
export function DrawerTrigger(props: DrawerTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="trigger"
      element="button"
      renderElement={DrawerTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerPortalElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerPortalProps = SolidPrimitivePartProps<DrawerController['parts']['portal'], 'div', false>;
export function DrawerPortal(props: DrawerPortalProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="portal"
      element="div"
      renderElement={DrawerPortalElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerBackdropElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerBackdropProps = SolidPrimitivePartProps<DrawerController['parts']['backdrop'], 'div', false>;
export function DrawerBackdrop(props: DrawerBackdropProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="backdrop"
      element="div"
      renderElement={DrawerBackdropElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerPositionerProps = SolidPrimitivePartProps<DrawerController['parts']['positioner'], 'div', false>;
export function DrawerPositioner(props: DrawerPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="positioner"
      element="div"
      renderElement={DrawerPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerContentProps = SolidPrimitivePartProps<DrawerController['parts']['content'], 'div', false>;
export function DrawerContent(props: DrawerContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="content"
      element="div"
      renderElement={DrawerContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerHandleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type DrawerHandleProps = SolidPrimitivePartProps<DrawerController['parts']['handle'], 'div', false>;
export function DrawerHandle(props: DrawerHandleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="handle"
      element="div"
      renderElement={DrawerHandleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type DrawerTitleProps = SolidPrimitivePartProps<DrawerController['parts']['title'], 'h2', false>;
export function DrawerTitle(props: DrawerTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="title"
      element="h2"
      renderElement={DrawerTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type DrawerDescriptionProps = SolidPrimitivePartProps<DrawerController['parts']['description'], 'p', false>;
export function DrawerDescription(props: DrawerDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="description"
      element="p"
      renderElement={DrawerDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function DrawerCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type DrawerCloseProps = SolidPrimitivePartProps<DrawerController['parts']['close'], 'button', false>;
export function DrawerClose(props: DrawerCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={DrawerDefinition as never}
      part="close"
      element="button"
      renderElement={DrawerCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const DrawerProvider = DrawerRoot;
export const Drawer = /* @__PURE__ */ Object.assign(DrawerRoot, { Provider: DrawerProvider, Root: DrawerRoot, Trigger: DrawerTrigger, Portal: DrawerPortal, Backdrop: DrawerBackdrop, Positioner: DrawerPositioner, Content: DrawerContent, Handle: DrawerHandle, Title: DrawerTitle, Description: DrawerDescription, Close: DrawerClose });
