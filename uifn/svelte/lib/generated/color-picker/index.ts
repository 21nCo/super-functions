import type { ComponentProps } from 'svelte';
import ColorPickerRootComponent from './Root.svelte';
import ColorPickerLabelComponent from './Label.svelte';
import ColorPickerControlComponent from './Control.svelte';
import ColorPickerTriggerComponent from './Trigger.svelte';
import ColorPickerPositionerComponent from './Positioner.svelte';
import ColorPickerContentComponent from './Content.svelte';
import ColorPickerAreaComponent from './Area.svelte';
import ColorPickerAreaThumbComponent from './AreaThumb.svelte';
import ColorPickerChannelSliderComponent from './ChannelSlider.svelte';
import ColorPickerChannelInputComponent from './ChannelInput.svelte';
import ColorPickerSwatchComponent from './Swatch.svelte';
import ColorPickerHiddenInputComponent from './HiddenInput.svelte';

export const ColorPickerRoot = ColorPickerRootComponent;
export type ColorPickerRootProps = ComponentProps<typeof ColorPickerRootComponent>;

export const ColorPickerLabel = ColorPickerLabelComponent;
export type ColorPickerLabelProps = ComponentProps<typeof ColorPickerLabelComponent>;

export const ColorPickerControl = ColorPickerControlComponent;
export type ColorPickerControlProps = ComponentProps<typeof ColorPickerControlComponent>;

export const ColorPickerTrigger = ColorPickerTriggerComponent;
export type ColorPickerTriggerProps = ComponentProps<typeof ColorPickerTriggerComponent>;

export const ColorPickerPositioner = ColorPickerPositionerComponent;
export type ColorPickerPositionerProps = ComponentProps<typeof ColorPickerPositionerComponent>;

export const ColorPickerContent = ColorPickerContentComponent;
export type ColorPickerContentProps = ComponentProps<typeof ColorPickerContentComponent>;

export const ColorPickerArea = ColorPickerAreaComponent;
export type ColorPickerAreaProps = ComponentProps<typeof ColorPickerAreaComponent>;

export const ColorPickerAreaThumb = ColorPickerAreaThumbComponent;
export type ColorPickerAreaThumbProps = ComponentProps<typeof ColorPickerAreaThumbComponent>;

export const ColorPickerChannelSlider = ColorPickerChannelSliderComponent;
export type ColorPickerChannelSliderProps = ComponentProps<typeof ColorPickerChannelSliderComponent>;

export const ColorPickerChannelInput = ColorPickerChannelInputComponent;
export type ColorPickerChannelInputProps = ComponentProps<typeof ColorPickerChannelInputComponent>;

export const ColorPickerSwatch = ColorPickerSwatchComponent;
export type ColorPickerSwatchProps = ComponentProps<typeof ColorPickerSwatchComponent>;

export const ColorPickerHiddenInput = ColorPickerHiddenInputComponent;
export type ColorPickerHiddenInputProps = ComponentProps<typeof ColorPickerHiddenInputComponent>;

export const ColorPickerProvider = ColorPickerRoot;
export const ColorPicker = Object.assign(ColorPickerRoot, { Provider: ColorPickerProvider, Root: ColorPickerRoot, Label: ColorPickerLabel, Control: ColorPickerControl, Trigger: ColorPickerTrigger, Positioner: ColorPickerPositioner, Content: ColorPickerContent, Area: ColorPickerArea, AreaThumb: ColorPickerAreaThumb, ChannelSlider: ColorPickerChannelSlider, ChannelInput: ColorPickerChannelInput, Swatch: ColorPickerSwatch, HiddenInput: ColorPickerHiddenInput });
