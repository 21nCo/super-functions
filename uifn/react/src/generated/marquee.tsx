'use client';

import * as React from 'react';
import { MarqueeContract, type MarqueeProps, type MarqueeContractParts } from '@uifn/core/primitives/marquee';
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

const MarqueeContext = React.createContext<ReactPrimitiveBridge<MarqueeProps> | null>(null);
const MarqueeDefinition: ReactPrimitiveDefinition<MarqueeProps> = {
  name: 'Marquee',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["direction","speed","pauseOnHover","pauseOnFocus","reducedMotionBehavior"],
  context: MarqueeContext,
  contract: MarqueeContract as never,
};

export type MarqueeRootProps = ReactPrimitiveRootProps<MarqueeProps, 'div'>;
export const MarqueeRoot = React.forwardRef<React.ElementRef<'div'>, MarqueeRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={MarqueeDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MarqueeRoot.displayName = 'MarqueeRoot';

export type MarqueeViewportProps = ReactPrimitivePartProps<MarqueeContractParts['viewport'], 'div', false>;
export const MarqueeViewport = React.forwardRef<React.ElementRef<'div'>, MarqueeViewportProps>((props, ref) => (
  <ReactPrimitivePart definition={MarqueeDefinition as never} part="viewport" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MarqueeViewport.displayName = 'MarqueeViewport';

export type MarqueeTrackProps = ReactPrimitivePartProps<MarqueeContractParts['track'], 'div', false>;
export const MarqueeTrack = React.forwardRef<React.ElementRef<'div'>, MarqueeTrackProps>((props, ref) => (
  <ReactPrimitivePart definition={MarqueeDefinition as never} part="track" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MarqueeTrack.displayName = 'MarqueeTrack';

export type MarqueeItemProps = ReactPrimitivePartProps<MarqueeContractParts['item'], 'div', true>;
export const MarqueeItem = React.forwardRef<React.ElementRef<'div'>, MarqueeItemProps>((props, ref) => (
  <ReactPrimitivePart definition={MarqueeDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MarqueeItem.displayName = 'MarqueeItem';

export const MarqueeProvider = MarqueeRoot;
export function useMarquee(inputs: MarqueeProps = {} as MarqueeProps): ReactPrimitiveHookResult<ReturnType<typeof MarqueeContract.getState>, Record<string, never>> {
  return useReactPrimitive(MarqueeDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof MarqueeContract.getState>, Record<string, never>>;
}
export const Marquee = Object.assign(MarqueeRoot, { Provider: MarqueeProvider, Root: MarqueeRoot, Viewport: MarqueeViewport, Track: MarqueeTrack, Item: MarqueeItem });
