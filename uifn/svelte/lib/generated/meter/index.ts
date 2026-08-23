import type { ComponentProps } from 'svelte';
import MeterRootComponent from './Root.svelte';
import MeterLabelComponent from './Label.svelte';
import MeterTrackComponent from './Track.svelte';
import MeterRangeComponent from './Range.svelte';
import MeterValueTextComponent from './ValueText.svelte';

export const MeterRoot = MeterRootComponent;
export type MeterRootProps = ComponentProps<typeof MeterRootComponent>;

export const MeterLabel = MeterLabelComponent;
export type MeterLabelProps = ComponentProps<typeof MeterLabelComponent>;

export const MeterTrack = MeterTrackComponent;
export type MeterTrackProps = ComponentProps<typeof MeterTrackComponent>;

export const MeterRange = MeterRangeComponent;
export type MeterRangeProps = ComponentProps<typeof MeterRangeComponent>;

export const MeterValueText = MeterValueTextComponent;
export type MeterValueTextProps = ComponentProps<typeof MeterValueTextComponent>;

export const MeterProvider = MeterRoot;
export const Meter = Object.assign(MeterRoot, { Provider: MeterProvider, Root: MeterRoot, Label: MeterLabel, Track: MeterTrack, Range: MeterRange, ValueText: MeterValueText });
