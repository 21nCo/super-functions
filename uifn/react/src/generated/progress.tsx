'use client';

import * as React from 'react';
import { ProgressContract, type ProgressProps, type ProgressContractParts } from '@uifn/core/primitives/progress';
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

const ProgressContext = React.createContext<ReactPrimitiveBridge<ProgressProps> | null>(null);
const ProgressDefinition: ReactPrimitiveDefinition<ProgressProps> = {
  name: 'Progress',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","indeterminate","formatValue"],
  context: ProgressContext,
  contract: ProgressContract as never,
};

export type ProgressRootProps = ReactPrimitiveRootProps<ProgressProps, 'div'>;
export const ProgressRoot = React.forwardRef<React.ElementRef<'div'>, ProgressRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={ProgressDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressRoot.displayName = 'ProgressRoot';

export type ProgressLabelProps = ReactPrimitivePartProps<ProgressContractParts['label'], 'span', false>;
export const ProgressLabel = React.forwardRef<React.ElementRef<'span'>, ProgressLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={ProgressDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressLabel.displayName = 'ProgressLabel';

export type ProgressTrackProps = ReactPrimitivePartProps<ProgressContractParts['track'], 'div', false>;
export const ProgressTrack = React.forwardRef<React.ElementRef<'div'>, ProgressTrackProps>((props, ref) => (
  <ReactPrimitivePart definition={ProgressDefinition as never} part="track" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressTrack.displayName = 'ProgressTrack';

export type ProgressRangeProps = ReactPrimitivePartProps<ProgressContractParts['range'], 'div', false>;
export const ProgressRange = React.forwardRef<React.ElementRef<'div'>, ProgressRangeProps>((props, ref) => (
  <ReactPrimitivePart definition={ProgressDefinition as never} part="range" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressRange.displayName = 'ProgressRange';

export type ProgressCircleProps = ReactPrimitivePartProps<ProgressContractParts['circle'], 'svg', false>;
export const ProgressCircle = React.forwardRef<React.ElementRef<'svg'>, ProgressCircleProps>((props, ref) => (
  <ReactPrimitivePart definition={ProgressDefinition as never} part="circle" element="svg" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressCircle.displayName = 'ProgressCircle';

export type ProgressValueTextProps = ReactPrimitivePartProps<ProgressContractParts['valueText'], 'span', false>;
export const ProgressValueText = React.forwardRef<React.ElementRef<'span'>, ProgressValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={ProgressDefinition as never} part="valueText" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
ProgressValueText.displayName = 'ProgressValueText';

export const ProgressProvider = ProgressRoot;
export function useProgress(inputs: ProgressProps = {} as ProgressProps): ReactPrimitiveHookResult<ReturnType<typeof ProgressContract.getState>, Record<string, never>> {
  return useReactPrimitive(ProgressDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof ProgressContract.getState>, Record<string, never>>;
}
export const Progress = Object.assign(ProgressRoot, { Provider: ProgressProvider, Root: ProgressRoot, Label: ProgressLabel, Track: ProgressTrack, Range: ProgressRange, Circle: ProgressCircle, ValueText: ProgressValueText });
