'use client';

import * as React from 'react';
import { MeterContract, type MeterProps, type MeterContractParts } from '@uifn/core/primitives/meter';
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

const MeterContext = React.createContext<ReactPrimitiveBridge<MeterProps> | null>(null);
const MeterDefinition: ReactPrimitiveDefinition<MeterProps> = {
  name: 'Meter',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","low","high","optimum","formatValue"],
  context: MeterContext,
  contract: MeterContract as never,
};

export type MeterRootProps = ReactPrimitiveRootProps<MeterProps, 'div'>;
export const MeterRoot = React.forwardRef<React.ElementRef<'div'>, MeterRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={MeterDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MeterRoot.displayName = 'MeterRoot';

export type MeterLabelProps = ReactPrimitivePartProps<MeterContractParts['label'], 'span', false>;
export const MeterLabel = React.forwardRef<React.ElementRef<'span'>, MeterLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={MeterDefinition as never} part="label" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MeterLabel.displayName = 'MeterLabel';

export type MeterTrackProps = ReactPrimitivePartProps<MeterContractParts['track'], 'div', false>;
export const MeterTrack = React.forwardRef<React.ElementRef<'div'>, MeterTrackProps>((props, ref) => (
  <ReactPrimitivePart definition={MeterDefinition as never} part="track" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MeterTrack.displayName = 'MeterTrack';

export type MeterRangeProps = ReactPrimitivePartProps<MeterContractParts['range'], 'div', false>;
export const MeterRange = React.forwardRef<React.ElementRef<'div'>, MeterRangeProps>((props, ref) => (
  <ReactPrimitivePart definition={MeterDefinition as never} part="range" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MeterRange.displayName = 'MeterRange';

export type MeterValueTextProps = ReactPrimitivePartProps<MeterContractParts['valueText'], 'span', false>;
export const MeterValueText = React.forwardRef<React.ElementRef<'span'>, MeterValueTextProps>((props, ref) => (
  <ReactPrimitivePart definition={MeterDefinition as never} part="valueText" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
MeterValueText.displayName = 'MeterValueText';

export const MeterProvider = MeterRoot;
export function useMeter(inputs: MeterProps): ReactPrimitiveHookResult<ReturnType<typeof MeterContract.getState>, Record<string, never>> {
  return useReactPrimitive(MeterDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof MeterContract.getState>, Record<string, never>>;
}
export const Meter = Object.assign(MeterRoot, { Provider: MeterProvider, Root: MeterRoot, Label: MeterLabel, Track: MeterTrack, Range: MeterRange, ValueText: MeterValueText });
