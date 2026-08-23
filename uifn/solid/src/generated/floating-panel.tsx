import { createContext, type JSX } from 'solid-js';
import { createFloatingPanelController, type FloatingPanelProps, type FloatingPanelController } from '@uifn/core/primitives/floating-panel';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const FloatingPanelContext = createContext<SolidPrimitiveContextValue<FloatingPanelProps>>();
export const FloatingPanelDefinition: SolidPrimitiveDefinition<FloatingPanelProps> = {
  name: 'FloatingPanel',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","placement","draggable","resizable"],
  context: FloatingPanelContext,
  createController: createFloatingPanelController as never,
};

function FloatingPanelRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelRootProps = SolidPrimitiveRootProps<FloatingPanelProps, 'div'>;
export function FloatingPanelRoot(props: FloatingPanelRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={FloatingPanelDefinition} element="div" renderElement={FloatingPanelRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function FloatingPanelTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type FloatingPanelTriggerProps = SolidPrimitivePartProps<FloatingPanelController['parts']['trigger'], 'button', false>;
export function FloatingPanelTrigger(props: FloatingPanelTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="trigger"
      element="button"
      renderElement={FloatingPanelTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelPositionerProps = SolidPrimitivePartProps<FloatingPanelController['parts']['positioner'], 'div', false>;
export function FloatingPanelPositioner(props: FloatingPanelPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="positioner"
      element="div"
      renderElement={FloatingPanelPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelContentProps = SolidPrimitivePartProps<FloatingPanelController['parts']['content'], 'div', false>;
export function FloatingPanelContent(props: FloatingPanelContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="content"
      element="div"
      renderElement={FloatingPanelContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelHeaderElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelHeaderProps = SolidPrimitivePartProps<FloatingPanelController['parts']['header'], 'div', false>;
export function FloatingPanelHeader(props: FloatingPanelHeaderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="header"
      element="div"
      renderElement={FloatingPanelHeaderElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type FloatingPanelTitleProps = SolidPrimitivePartProps<FloatingPanelController['parts']['title'], 'h2', false>;
export function FloatingPanelTitle(props: FloatingPanelTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="title"
      element="h2"
      renderElement={FloatingPanelTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type FloatingPanelDescriptionProps = SolidPrimitivePartProps<FloatingPanelController['parts']['description'], 'p', false>;
export function FloatingPanelDescription(props: FloatingPanelDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="description"
      element="p"
      renderElement={FloatingPanelDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelDragHandleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelDragHandleProps = SolidPrimitivePartProps<FloatingPanelController['parts']['dragHandle'], 'div', false>;
export function FloatingPanelDragHandle(props: FloatingPanelDragHandleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="dragHandle"
      element="div"
      renderElement={FloatingPanelDragHandleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FloatingPanelResizeHandleElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FloatingPanelResizeHandleProps = SolidPrimitivePartProps<FloatingPanelController['parts']['resizeHandle'], 'div', true>;
export function FloatingPanelResizeHandle(props: FloatingPanelResizeHandleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="resizeHandle"
      element="div"
      renderElement={FloatingPanelResizeHandleElement as never}
      many={true}
      props={props as never}
    />
  );
}

function FloatingPanelCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type FloatingPanelCloseProps = SolidPrimitivePartProps<FloatingPanelController['parts']['close'], 'button', false>;
export function FloatingPanelClose(props: FloatingPanelCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FloatingPanelDefinition as never}
      part="close"
      element="button"
      renderElement={FloatingPanelCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const FloatingPanelProvider = FloatingPanelRoot;
export const FloatingPanel = /* @__PURE__ */ Object.assign(FloatingPanelRoot, { Provider: FloatingPanelProvider, Root: FloatingPanelRoot, Trigger: FloatingPanelTrigger, Positioner: FloatingPanelPositioner, Content: FloatingPanelContent, Header: FloatingPanelHeader, Title: FloatingPanelTitle, Description: FloatingPanelDescription, DragHandle: FloatingPanelDragHandle, ResizeHandle: FloatingPanelResizeHandle, Close: FloatingPanelClose });
