'use client';

import * as React from 'react';
import { createTimerController, type TimerProps, type TimerController } from '@uifn/core/primitives/timer';
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

const TimerContext = React.createContext<ReactPrimitiveBridge<TimerProps> | null>(null);
const TimerDefinition: ReactPrimitiveDefinition<TimerProps> = {
  name: 'Timer',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["duration","remaining","defaultRemaining","direction","autoStart","announceInterval"],
  context: TimerContext,
  createController: createTimerController as never,
};

export type TimerRootProps = ReactPrimitiveRootProps<TimerProps, 'div'>;
export const TimerRoot = React.forwardRef<React.ElementRef<'div'>, TimerRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TimerDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerRoot.displayName = 'TimerRoot';

export type TimerValueProps = ReactPrimitivePartProps<TimerController['parts']['value'], 'time', false>;
export const TimerValue = React.forwardRef<React.ElementRef<'time'>, TimerValueProps>((props, ref) => (
  <ReactPrimitivePart definition={TimerDefinition as never} part="value" element="time" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerValue.displayName = 'TimerValue';

export type TimerStartProps = ReactPrimitivePartProps<TimerController['parts']['start'], 'button', false>;
export const TimerStart = React.forwardRef<React.ElementRef<'button'>, TimerStartProps>((props, ref) => (
  <ReactPrimitivePart definition={TimerDefinition as never} part="start" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerStart.displayName = 'TimerStart';

export type TimerPauseProps = ReactPrimitivePartProps<TimerController['parts']['pause'], 'button', false>;
export const TimerPause = React.forwardRef<React.ElementRef<'button'>, TimerPauseProps>((props, ref) => (
  <ReactPrimitivePart definition={TimerDefinition as never} part="pause" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerPause.displayName = 'TimerPause';

export type TimerResetProps = ReactPrimitivePartProps<TimerController['parts']['reset'], 'button', false>;
export const TimerReset = React.forwardRef<React.ElementRef<'button'>, TimerResetProps>((props, ref) => (
  <ReactPrimitivePart definition={TimerDefinition as never} part="reset" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerReset.displayName = 'TimerReset';

export type TimerStatusProps = ReactPrimitivePartProps<TimerController['parts']['status'], 'span', false>;
export const TimerStatus = React.forwardRef<React.ElementRef<'span'>, TimerStatusProps>((props, ref) => (
  <ReactPrimitivePart definition={TimerDefinition as never} part="status" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TimerStatus.displayName = 'TimerStatus';

export const TimerProvider = TimerRoot;
export function useTimer(inputs: TimerProps): ReactPrimitiveHookResult<TimerController['state'], TimerController['actions']> {
  return useReactPrimitive(TimerDefinition, inputs) as ReactPrimitiveHookResult<TimerController['state'], TimerController['actions']>;
}
export const Timer = Object.assign(TimerRoot, { Provider: TimerProvider, Root: TimerRoot, Value: TimerValue, Start: TimerStart, Pause: TimerPause, Reset: TimerReset, Status: TimerStatus });
