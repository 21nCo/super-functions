import type { ComponentProps } from 'svelte';
import SliderRootComponent from './Root.svelte';
import SliderLabelComponent from './Label.svelte';
import SliderControlComponent from './Control.svelte';
import SliderTrackComponent from './Track.svelte';
import SliderRangeComponent from './Range.svelte';
import SliderThumbComponent from './Thumb.svelte';
import SliderValueTextComponent from './ValueText.svelte';
import SliderHiddenInputComponent from './HiddenInput.svelte';

export const SliderRoot = SliderRootComponent;
export type SliderRootProps = ComponentProps<typeof SliderRootComponent>;

export const SliderLabel = SliderLabelComponent;
export type SliderLabelProps = ComponentProps<typeof SliderLabelComponent>;

export const SliderControl = SliderControlComponent;
export type SliderControlProps = ComponentProps<typeof SliderControlComponent>;

export const SliderTrack = SliderTrackComponent;
export type SliderTrackProps = ComponentProps<typeof SliderTrackComponent>;

export const SliderRange = SliderRangeComponent;
export type SliderRangeProps = ComponentProps<typeof SliderRangeComponent>;

export const SliderThumb = SliderThumbComponent;
export type SliderThumbProps = ComponentProps<typeof SliderThumbComponent>;

export const SliderValueText = SliderValueTextComponent;
export type SliderValueTextProps = ComponentProps<typeof SliderValueTextComponent>;

export const SliderHiddenInput = SliderHiddenInputComponent;
export type SliderHiddenInputProps = ComponentProps<typeof SliderHiddenInputComponent>;

export const SliderProvider = SliderRoot;
export const Slider = Object.assign(SliderRoot, { Provider: SliderProvider, Root: SliderRoot, Label: SliderLabel, Control: SliderControl, Track: SliderTrack, Range: SliderRange, Thumb: SliderThumb, ValueText: SliderValueText, HiddenInput: SliderHiddenInput });
