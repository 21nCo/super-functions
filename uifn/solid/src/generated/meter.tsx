import { createContext, type JSX } from 'solid-js';
import { MeterContract, type MeterProps, type MeterContractParts } from '@uifn/core/primitives/meter';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const MeterContext = createContext<SolidPrimitiveContextValue<MeterProps>>();
export const MeterDefinition: SolidPrimitiveDefinition<MeterProps> = {
  name: 'Meter',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","min","max","low","high","optimum","formatValue"],
  context: MeterContext,
  contract: MeterContract as never,
};

function MeterRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MeterRootProps = SolidPrimitiveRootProps<MeterProps, 'div'>;
export function MeterRoot(props: MeterRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={MeterDefinition} element="div" renderElement={MeterRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function MeterLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type MeterLabelProps = SolidPrimitivePartProps<MeterContractParts['label'], 'span', false>;
export function MeterLabel(props: MeterLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MeterDefinition as never}
      part="label"
      element="span"
      renderElement={MeterLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MeterTrackElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MeterTrackProps = SolidPrimitivePartProps<MeterContractParts['track'], 'div', false>;
export function MeterTrack(props: MeterTrackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MeterDefinition as never}
      part="track"
      element="div"
      renderElement={MeterTrackElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MeterRangeElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type MeterRangeProps = SolidPrimitivePartProps<MeterContractParts['range'], 'div', false>;
export function MeterRange(props: MeterRangeProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MeterDefinition as never}
      part="range"
      element="div"
      renderElement={MeterRangeElement as never}
      many={false}
      props={props as never}
    />
  );
}

function MeterValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type MeterValueTextProps = SolidPrimitivePartProps<MeterContractParts['valueText'], 'span', false>;
export function MeterValueText(props: MeterValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={MeterDefinition as never}
      part="valueText"
      element="span"
      renderElement={MeterValueTextElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const MeterProvider = MeterRoot;
export const Meter = /* @__PURE__ */ Object.assign(MeterRoot, { Provider: MeterProvider, Root: MeterRoot, Label: MeterLabel, Track: MeterTrack, Range: MeterRange, ValueText: MeterValueText });
