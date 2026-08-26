'use client';

import * as React from 'react';
import { createSplitterController, type SplitterProps, type SplitterController } from '@uifn/core/primitives/splitter';
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

const SplitterContext = React.createContext<ReactPrimitiveBridge<SplitterProps> | null>(null);
const SplitterDefinition: ReactPrimitiveDefinition<SplitterProps> = {
  name: 'Splitter',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["sizes","defaultSizes","minSizes","maxSizes","orientation","dir","disabled"],
  context: SplitterContext,
  createController: createSplitterController as never,
};

export type SplitterRootProps = ReactPrimitiveRootProps<SplitterProps, 'div'>;
export const SplitterRoot = React.forwardRef<React.ElementRef<'div'>, SplitterRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SplitterDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SplitterRoot.displayName = 'SplitterRoot';

export type SplitterPanelProps = ReactPrimitivePartProps<SplitterController['parts']['panel'], 'div', true>;
export const SplitterPanel = React.forwardRef<React.ElementRef<'div'>, SplitterPanelProps>((props, ref) => (
  <ReactPrimitivePart definition={SplitterDefinition as never} part="panel" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SplitterPanel.displayName = 'SplitterPanel';

export type SplitterResizeTriggerProps = ReactPrimitivePartProps<SplitterController['parts']['resizeTrigger'], 'div', true>;
export const SplitterResizeTrigger = React.forwardRef<React.ElementRef<'div'>, SplitterResizeTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={SplitterDefinition as never} part="resizeTrigger" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SplitterResizeTrigger.displayName = 'SplitterResizeTrigger';

export type SplitterResizeHandleProps = ReactPrimitivePartProps<SplitterController['parts']['resizeHandle'], 'div', true>;
export const SplitterResizeHandle = React.forwardRef<React.ElementRef<'div'>, SplitterResizeHandleProps>((props, ref) => (
  <ReactPrimitivePart definition={SplitterDefinition as never} part="resizeHandle" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SplitterResizeHandle.displayName = 'SplitterResizeHandle';

export const SplitterProvider = SplitterRoot;
export function useSplitter(inputs: SplitterProps = {} as SplitterProps): ReactPrimitiveHookResult<SplitterController['state'], SplitterController['actions']> {
  return useReactPrimitive(SplitterDefinition, inputs) as ReactPrimitiveHookResult<SplitterController['state'], SplitterController['actions']>;
}
export const Splitter = Object.assign(SplitterRoot, { Provider: SplitterProvider, Root: SplitterRoot, Panel: SplitterPanel, ResizeTrigger: SplitterResizeTrigger, ResizeHandle: SplitterResizeHandle });
