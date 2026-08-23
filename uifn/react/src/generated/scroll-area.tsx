'use client';

import * as React from 'react';
import { createScrollAreaController, type ScrollAreaProps, type ScrollAreaController } from '@uifn/core/primitives/scroll-area';
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

const ScrollAreaContext = React.createContext<ReactPrimitiveBridge<ScrollAreaProps> | null>(null);
const ScrollAreaDefinition: ReactPrimitiveDefinition<ScrollAreaProps> = {
  name: 'ScrollArea',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["type","scrollHideDelay","orientation","dir"],
  context: ScrollAreaContext,
  createController: createScrollAreaController as never,
};

export type ScrollAreaRootProps = ReactPrimitiveRootProps<ScrollAreaProps, 'div'>;
export const ScrollAreaRoot = React.forwardRef<React.ElementRef<'div'>, ScrollAreaRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ScrollAreaDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaRoot.displayName = 'ScrollAreaRoot';

export type ScrollAreaViewportProps = ReactPrimitivePartProps<ScrollAreaController['parts']['viewport'], 'div', false>;
export const ScrollAreaViewport = React.forwardRef<React.ElementRef<'div'>, ScrollAreaViewportProps>((props, ref) => (
  <ReactPrimitivePart definition={ScrollAreaDefinition as never} part="viewport" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaViewport.displayName = 'ScrollAreaViewport';

export type ScrollAreaContentProps = ReactPrimitivePartProps<ScrollAreaController['parts']['content'], 'div', false>;
export const ScrollAreaContent = React.forwardRef<React.ElementRef<'div'>, ScrollAreaContentProps>((props, ref) => (
  <ReactPrimitivePart definition={ScrollAreaDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaContent.displayName = 'ScrollAreaContent';

export type ScrollAreaScrollbarProps = ReactPrimitivePartProps<ScrollAreaController['parts']['scrollbar'], 'div', true>;
export const ScrollAreaScrollbar = React.forwardRef<React.ElementRef<'div'>, ScrollAreaScrollbarProps>((props, ref) => (
  <ReactPrimitivePart definition={ScrollAreaDefinition as never} part="scrollbar" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaScrollbar.displayName = 'ScrollAreaScrollbar';

export type ScrollAreaThumbProps = ReactPrimitivePartProps<ScrollAreaController['parts']['thumb'], 'div', true>;
export const ScrollAreaThumb = React.forwardRef<React.ElementRef<'div'>, ScrollAreaThumbProps>((props, ref) => (
  <ReactPrimitivePart definition={ScrollAreaDefinition as never} part="thumb" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaThumb.displayName = 'ScrollAreaThumb';

export type ScrollAreaCornerProps = ReactPrimitivePartProps<ScrollAreaController['parts']['corner'], 'div', false>;
export const ScrollAreaCorner = React.forwardRef<React.ElementRef<'div'>, ScrollAreaCornerProps>((props, ref) => (
  <ReactPrimitivePart definition={ScrollAreaDefinition as never} part="corner" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ScrollAreaCorner.displayName = 'ScrollAreaCorner';

export const ScrollAreaProvider = ScrollAreaRoot;
export function useScrollArea(inputs: ScrollAreaProps = {} as ScrollAreaProps): ReactPrimitiveHookResult<ScrollAreaController['state'], ScrollAreaController['actions']> {
  return useReactPrimitive(ScrollAreaDefinition, inputs) as ReactPrimitiveHookResult<ScrollAreaController['state'], ScrollAreaController['actions']>;
}
export const ScrollArea = Object.assign(ScrollAreaRoot, { Provider: ScrollAreaProvider, Root: ScrollAreaRoot, Viewport: ScrollAreaViewport, Content: ScrollAreaContent, Scrollbar: ScrollAreaScrollbar, Thumb: ScrollAreaThumb, Corner: ScrollAreaCorner });
