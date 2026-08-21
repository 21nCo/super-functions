import type { ComponentProps } from 'svelte';
import AngleSliderRootComponent from './Root.svelte';
import AngleSliderTrackComponent from './Track.svelte';
import AngleSliderThumbComponent from './Thumb.svelte';
import AngleSliderValueTextComponent from './ValueText.svelte';
import AngleSliderHiddenInputComponent from './HiddenInput.svelte';

export const AngleSliderRoot = AngleSliderRootComponent;
export type AngleSliderRootProps = ComponentProps<typeof AngleSliderRootComponent>;

export const AngleSliderTrack = AngleSliderTrackComponent;
export type AngleSliderTrackProps = ComponentProps<typeof AngleSliderTrackComponent>;

export const AngleSliderThumb = AngleSliderThumbComponent;
export type AngleSliderThumbProps = ComponentProps<typeof AngleSliderThumbComponent>;

export const AngleSliderValueText = AngleSliderValueTextComponent;
export type AngleSliderValueTextProps = ComponentProps<typeof AngleSliderValueTextComponent>;

export const AngleSliderHiddenInput = AngleSliderHiddenInputComponent;
export type AngleSliderHiddenInputProps = ComponentProps<typeof AngleSliderHiddenInputComponent>;

export const AngleSliderProvider = AngleSliderRoot;
export const AngleSlider = Object.assign(AngleSliderRoot, { Provider: AngleSliderProvider, Root: AngleSliderRoot, Track: AngleSliderTrack, Thumb: AngleSliderThumb, ValueText: AngleSliderValueText, HiddenInput: AngleSliderHiddenInput });
