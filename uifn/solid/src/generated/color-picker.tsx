import { createContext, type JSX } from 'solid-js';
import { createColorPickerController, type ColorPickerProps, type ColorPickerController } from '@uifn/core/primitives/color-picker';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ColorPickerContext = createContext<SolidPrimitiveContextValue<ColorPickerProps>>();
export const ColorPickerDefinition: SolidPrimitiveDefinition<ColorPickerProps> = {
  name: 'ColorPicker',
  family: 'date-color',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","open","defaultOpen","colorSpace","alpha","name","disabled","readOnly"],
  context: ColorPickerContext,
  createController: createColorPickerController as never,
};

function ColorPickerRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerRootProps = SolidPrimitiveRootProps<ColorPickerProps, 'div'>;
export function ColorPickerRoot(props: ColorPickerRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ColorPickerDefinition} element="div" renderElement={ColorPickerRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ColorPickerLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type ColorPickerLabelProps = SolidPrimitivePartProps<ColorPickerController['parts']['label'], 'label', false>;
export function ColorPickerLabel(props: ColorPickerLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="label"
      element="label"
      renderElement={ColorPickerLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerControlProps = SolidPrimitivePartProps<ColorPickerController['parts']['control'], 'div', false>;
export function ColorPickerControl(props: ColorPickerControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="control"
      element="div"
      renderElement={ColorPickerControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ColorPickerTriggerProps = SolidPrimitivePartProps<ColorPickerController['parts']['trigger'], 'button', false>;
export function ColorPickerTrigger(props: ColorPickerTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="trigger"
      element="button"
      renderElement={ColorPickerTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerPositionerProps = SolidPrimitivePartProps<ColorPickerController['parts']['positioner'], 'div', false>;
export function ColorPickerPositioner(props: ColorPickerPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="positioner"
      element="div"
      renderElement={ColorPickerPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerContentProps = SolidPrimitivePartProps<ColorPickerController['parts']['content'], 'div', false>;
export function ColorPickerContent(props: ColorPickerContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="content"
      element="div"
      renderElement={ColorPickerContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerAreaElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerAreaProps = SolidPrimitivePartProps<ColorPickerController['parts']['area'], 'div', false>;
export function ColorPickerArea(props: ColorPickerAreaProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="area"
      element="div"
      renderElement={ColorPickerAreaElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerAreaThumbElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerAreaThumbProps = SolidPrimitivePartProps<ColorPickerController['parts']['areaThumb'], 'div', false>;
export function ColorPickerAreaThumb(props: ColorPickerAreaThumbProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="areaThumb"
      element="div"
      renderElement={ColorPickerAreaThumbElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerChannelSliderElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ColorPickerChannelSliderProps = SolidPrimitivePartProps<ColorPickerController['parts']['channelSlider'], 'div', true>;
export function ColorPickerChannelSlider(props: ColorPickerChannelSliderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="channelSlider"
      element="div"
      renderElement={ColorPickerChannelSliderElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ColorPickerChannelInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ColorPickerChannelInputProps = SolidPrimitivePartProps<ColorPickerController['parts']['channelInput'], 'input', true>;
export function ColorPickerChannelInput(props: ColorPickerChannelInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="channelInput"
      element="input"
      renderElement={ColorPickerChannelInputElement as never}
      many={true}
      props={props as never}
    />
  );
}

function ColorPickerSwatchElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ColorPickerSwatchProps = SolidPrimitivePartProps<ColorPickerController['parts']['swatch'], 'span', false>;
export function ColorPickerSwatch(props: ColorPickerSwatchProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="swatch"
      element="span"
      renderElement={ColorPickerSwatchElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ColorPickerHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type ColorPickerHiddenInputProps = SolidPrimitivePartProps<ColorPickerController['parts']['hiddenInput'], 'input', false>;
export function ColorPickerHiddenInput(props: ColorPickerHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ColorPickerDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={ColorPickerHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ColorPickerProvider = ColorPickerRoot;
export const ColorPicker = /* @__PURE__ */ Object.assign(ColorPickerRoot, { Provider: ColorPickerProvider, Root: ColorPickerRoot, Label: ColorPickerLabel, Control: ColorPickerControl, Trigger: ColorPickerTrigger, Positioner: ColorPickerPositioner, Content: ColorPickerContent, Area: ColorPickerArea, AreaThumb: ColorPickerAreaThumb, ChannelSlider: ColorPickerChannelSlider, ChannelInput: ColorPickerChannelInput, Swatch: ColorPickerSwatch, HiddenInput: ColorPickerHiddenInput });
