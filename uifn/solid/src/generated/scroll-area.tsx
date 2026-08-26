import { createContext, type JSX } from 'solid-js';
import { createScrollAreaController, type ScrollAreaProps, type ScrollAreaController } from '@uifn/core/primitives/scroll-area';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ScrollAreaContext = createContext<SolidPrimitiveContextValue<ScrollAreaProps>>();
export const ScrollAreaDefinition: SolidPrimitiveDefinition<ScrollAreaProps> = {
  name: 'ScrollArea',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["type","scrollHideDelay","orientation","dir"],
  context: ScrollAreaContext,
  createController: createScrollAreaController as never,
};

function ScrollAreaRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaRootProps = SolidPrimitiveRootProps<ScrollAreaProps, 'div'>;
export function ScrollAreaRoot(props: ScrollAreaRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ScrollAreaDefinition} element="div" renderElement={ScrollAreaRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ScrollAreaViewportElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaViewportProps = SolidPrimitivePartProps<ScrollAreaController['parts']['viewport'], 'div', false>;
export function ScrollAreaViewport(props: ScrollAreaViewportProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ScrollAreaDefinition as never}
      part="viewport"
      element="div"
      renderElement={ScrollAreaViewportElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ScrollAreaContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaContentProps = SolidPrimitivePartProps<ScrollAreaController['parts']['content'], 'div', false>;
export function ScrollAreaContent(props: ScrollAreaContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ScrollAreaDefinition as never}
      part="content"
      element="div"
      renderElement={ScrollAreaContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ScrollAreaScrollbarElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaScrollbarProps = SolidPrimitivePartProps<ScrollAreaController['parts']['scrollbar'], 'div', true>;
export function ScrollAreaScrollbar(props: ScrollAreaScrollbarProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ScrollAreaDefinition as never}
      part="scrollbar"
      element="div"
      renderElement={ScrollAreaScrollbarElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ScrollAreaThumbElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaThumbProps = SolidPrimitivePartProps<ScrollAreaController['parts']['thumb'], 'div', true>;
export function ScrollAreaThumb(props: ScrollAreaThumbProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ScrollAreaDefinition as never}
      part="thumb"
      element="div"
      renderElement={ScrollAreaThumbElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ScrollAreaCornerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ScrollAreaCornerProps = SolidPrimitivePartProps<ScrollAreaController['parts']['corner'], 'div', false>;
export function ScrollAreaCorner(props: ScrollAreaCornerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ScrollAreaDefinition as never}
      part="corner"
      element="div"
      renderElement={ScrollAreaCornerElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ScrollAreaProvider = ScrollAreaRoot;
export const ScrollArea = /* @__PURE__ */ Object.assign(ScrollAreaRoot, { Provider: ScrollAreaProvider, Root: ScrollAreaRoot, Viewport: ScrollAreaViewport, Content: ScrollAreaContent, Scrollbar: ScrollAreaScrollbar, Thumb: ScrollAreaThumb, Corner: ScrollAreaCorner });
