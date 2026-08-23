import type { ComponentProps } from 'svelte';
import ProgressRootComponent from './Root.svelte';
import ProgressLabelComponent from './Label.svelte';
import ProgressTrackComponent from './Track.svelte';
import ProgressRangeComponent from './Range.svelte';
import ProgressCircleComponent from './Circle.svelte';
import ProgressValueTextComponent from './ValueText.svelte';

export const ProgressRoot = ProgressRootComponent;
export type ProgressRootProps = ComponentProps<typeof ProgressRootComponent>;

export const ProgressLabel = ProgressLabelComponent;
export type ProgressLabelProps = ComponentProps<typeof ProgressLabelComponent>;

export const ProgressTrack = ProgressTrackComponent;
export type ProgressTrackProps = ComponentProps<typeof ProgressTrackComponent>;

export const ProgressRange = ProgressRangeComponent;
export type ProgressRangeProps = ComponentProps<typeof ProgressRangeComponent>;

export const ProgressCircle = ProgressCircleComponent;
export type ProgressCircleProps = ComponentProps<typeof ProgressCircleComponent>;

export const ProgressValueText = ProgressValueTextComponent;
export type ProgressValueTextProps = ComponentProps<typeof ProgressValueTextComponent>;

export const ProgressProvider = ProgressRoot;
export const Progress = Object.assign(ProgressRoot, { Provider: ProgressProvider, Root: ProgressRoot, Label: ProgressLabel, Track: ProgressTrack, Range: ProgressRange, Circle: ProgressCircle, ValueText: ProgressValueText });
