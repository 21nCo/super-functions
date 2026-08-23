import { createContext, type JSX } from 'solid-js';
import { createTimerController, type TimerProps, type TimerController } from '@uifn/core/primitives/timer';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TimerContext = createContext<SolidPrimitiveContextValue<TimerProps>>();
export const TimerDefinition: SolidPrimitiveDefinition<TimerProps> = {
  name: 'Timer',
  family: 'status-feedback',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["duration","remaining","defaultRemaining","direction","autoStart","announceInterval"],
  context: TimerContext,
  createController: createTimerController as never,
};

function TimerRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TimerRootProps = SolidPrimitiveRootProps<TimerProps, 'div'>;
export function TimerRoot(props: TimerRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TimerDefinition} element="div" renderElement={TimerRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TimerValueElement(props: JSX.IntrinsicElements['time']): JSX.Element {
  return <time {...props} />;
}

export type TimerValueProps = SolidPrimitivePartProps<TimerController['parts']['value'], 'time', false>;
export function TimerValue(props: TimerValueProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TimerDefinition as never}
      part="value"
      element="time"
      renderElement={TimerValueElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TimerStartElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TimerStartProps = SolidPrimitivePartProps<TimerController['parts']['start'], 'button', false>;
export function TimerStart(props: TimerStartProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TimerDefinition as never}
      part="start"
      element="button"
      renderElement={TimerStartElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TimerPauseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TimerPauseProps = SolidPrimitivePartProps<TimerController['parts']['pause'], 'button', false>;
export function TimerPause(props: TimerPauseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TimerDefinition as never}
      part="pause"
      element="button"
      renderElement={TimerPauseElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TimerResetElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TimerResetProps = SolidPrimitivePartProps<TimerController['parts']['reset'], 'button', false>;
export function TimerReset(props: TimerResetProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TimerDefinition as never}
      part="reset"
      element="button"
      renderElement={TimerResetElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TimerStatusElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TimerStatusProps = SolidPrimitivePartProps<TimerController['parts']['status'], 'span', false>;
export function TimerStatus(props: TimerStatusProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TimerDefinition as never}
      part="status"
      element="span"
      renderElement={TimerStatusElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TimerProvider = TimerRoot;
export const Timer = /* @__PURE__ */ Object.assign(TimerRoot, { Provider: TimerProvider, Root: TimerRoot, Value: TimerValue, Start: TimerStart, Pause: TimerPause, Reset: TimerReset, Status: TimerStatus });
