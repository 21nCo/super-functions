import { createContext, type JSX } from 'solid-js';
import { ProgressContract, type ProgressProps, type ProgressContractParts } from '@uifn/core/primitives/progress';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ProgressContext = createContext<SolidPrimitiveContextValue<ProgressProps>>();
export const ProgressDefinition: SolidPrimitiveDefinition<ProgressProps> = {
  name: 'Progress',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","indeterminate","formatValue"],
  context: ProgressContext,
  contract: ProgressContract as never,
};

function ProgressRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ProgressRootProps = SolidPrimitiveRootProps<ProgressProps, 'div'>;
export function ProgressRoot(props: ProgressRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ProgressDefinition} element="div" renderElement={ProgressRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ProgressLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ProgressLabelProps = SolidPrimitivePartProps<ProgressContractParts['label'], 'span', false>;
export function ProgressLabel(props: ProgressLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ProgressDefinition as never}
      part="label"
      element="span"
      renderElement={ProgressLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ProgressTrackElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ProgressTrackProps = SolidPrimitivePartProps<ProgressContractParts['track'], 'div', false>;
export function ProgressTrack(props: ProgressTrackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ProgressDefinition as never}
      part="track"
      element="div"
      renderElement={ProgressTrackElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ProgressRangeElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ProgressRangeProps = SolidPrimitivePartProps<ProgressContractParts['range'], 'div', false>;
export function ProgressRange(props: ProgressRangeProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ProgressDefinition as never}
      part="range"
      element="div"
      renderElement={ProgressRangeElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ProgressCircleElement(props: JSX.IntrinsicElements['svg']): JSX.Element {
  return <svg {...props} />;
}

export type ProgressCircleProps = SolidPrimitivePartProps<ProgressContractParts['circle'], 'svg', false>;
export function ProgressCircle(props: ProgressCircleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ProgressDefinition as never}
      part="circle"
      element="svg"
      renderElement={ProgressCircleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ProgressValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ProgressValueTextProps = SolidPrimitivePartProps<ProgressContractParts['valueText'], 'span', false>;
export function ProgressValueText(props: ProgressValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ProgressDefinition as never}
      part="valueText"
      element="span"
      renderElement={ProgressValueTextElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ProgressProvider = ProgressRoot;
export const Progress = /* @__PURE__ */ Object.assign(ProgressRoot, { Provider: ProgressProvider, Root: ProgressRoot, Label: ProgressLabel, Track: ProgressTrack, Range: ProgressRange, Circle: ProgressCircle, ValueText: ProgressValueText });
