import { createContext, type JSX } from 'solid-js';
import { createSliderController, type SliderProps, type SliderController } from '@uifn/core/primitives/slider';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SliderContext = createContext<SolidPrimitiveContextValue<SliderProps>>();
export const SliderDefinition: SolidPrimitiveDefinition<SliderProps> = {
  name: 'Slider',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","minStepsBetweenThumbs","orientation","dir","name","disabled","readOnly"],
  context: SliderContext,
  createController: createSliderController as never,
};

function SliderRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SliderRootProps = SolidPrimitiveRootProps<SliderProps, 'div'>;
export function SliderRoot(props: SliderRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SliderDefinition} element="div" renderElement={SliderRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SliderLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type SliderLabelProps = SolidPrimitivePartProps<SliderController['parts']['label'], 'label', false>;
export function SliderLabel(props: SliderLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="label"
      element="label"
      renderElement={SliderLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SliderControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SliderControlProps = SolidPrimitivePartProps<SliderController['parts']['control'], 'div', false>;
export function SliderControl(props: SliderControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="control"
      element="div"
      renderElement={SliderControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SliderTrackElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SliderTrackProps = SolidPrimitivePartProps<SliderController['parts']['track'], 'div', false>;
export function SliderTrack(props: SliderTrackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="track"
      element="div"
      renderElement={SliderTrackElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SliderRangeElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SliderRangeProps = SolidPrimitivePartProps<SliderController['parts']['range'], 'div', false>;
export function SliderRange(props: SliderRangeProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="range"
      element="div"
      renderElement={SliderRangeElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SliderThumbElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SliderThumbProps = SolidPrimitivePartProps<SliderController['parts']['thumb'], 'div', true>;
export function SliderThumb(props: SliderThumbProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="thumb"
      element="div"
      renderElement={SliderThumbElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SliderValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SliderValueTextProps = SolidPrimitivePartProps<SliderController['parts']['valueText'], 'span', true>;
export function SliderValueText(props: SliderValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="valueText"
      element="span"
      renderElement={SliderValueTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function SliderHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type SliderHiddenInputProps = SolidPrimitivePartProps<SliderController['parts']['hiddenInput'], 'input', true>;
export function SliderHiddenInput(props: SliderHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SliderDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={SliderHiddenInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const SliderProvider = SliderRoot;
export const Slider = /* @__PURE__ */ Object.assign(SliderRoot, { Provider: SliderProvider, Root: SliderRoot, Label: SliderLabel, Control: SliderControl, Track: SliderTrack, Range: SliderRange, Thumb: SliderThumb, ValueText: SliderValueText, HiddenInput: SliderHiddenInput });
