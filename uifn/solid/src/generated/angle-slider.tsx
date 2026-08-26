import { createContext, type JSX } from 'solid-js';
import { createAngleSliderController, type AngleSliderProps, type AngleSliderController } from '@uifn/core/primitives/angle-slider';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const AngleSliderContext = createContext<SolidPrimitiveContextValue<AngleSliderProps>>();
export const AngleSliderDefinition: SolidPrimitiveDefinition<AngleSliderProps> = {
  name: 'AngleSlider',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","min","max","step","disabled","readOnly"],
  context: AngleSliderContext,
  createController: createAngleSliderController as never,
};

function AngleSliderRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AngleSliderRootProps = SolidPrimitiveRootProps<AngleSliderProps, 'div'>;
export function AngleSliderRoot(props: AngleSliderRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={AngleSliderDefinition} element="div" renderElement={AngleSliderRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function AngleSliderTrackElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AngleSliderTrackProps = SolidPrimitivePartProps<AngleSliderController['parts']['track'], 'div', false>;
export function AngleSliderTrack(props: AngleSliderTrackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AngleSliderDefinition as never}
      part="track"
      element="div"
      renderElement={AngleSliderTrackElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AngleSliderThumbElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AngleSliderThumbProps = SolidPrimitivePartProps<AngleSliderController['parts']['thumb'], 'div', false>;
export function AngleSliderThumb(props: AngleSliderThumbProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AngleSliderDefinition as never}
      part="thumb"
      element="div"
      renderElement={AngleSliderThumbElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AngleSliderValueTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type AngleSliderValueTextProps = SolidPrimitivePartProps<AngleSliderController['parts']['valueText'], 'span', false>;
export function AngleSliderValueText(props: AngleSliderValueTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AngleSliderDefinition as never}
      part="valueText"
      element="span"
      renderElement={AngleSliderValueTextElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AngleSliderHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type AngleSliderHiddenInputProps = SolidPrimitivePartProps<AngleSliderController['parts']['hiddenInput'], 'input', false>;
export function AngleSliderHiddenInput(props: AngleSliderHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AngleSliderDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={AngleSliderHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const AngleSliderProvider = AngleSliderRoot;
export const AngleSlider = /* @__PURE__ */ Object.assign(AngleSliderRoot, { Provider: AngleSliderProvider, Root: AngleSliderRoot, Track: AngleSliderTrack, Thumb: AngleSliderThumb, ValueText: AngleSliderValueText, HiddenInput: AngleSliderHiddenInput });
