import type { ComponentProps } from 'svelte';
import TimerRootComponent from './Root.svelte';
import TimerValueComponent from './Value.svelte';
import TimerStartComponent from './Start.svelte';
import TimerPauseComponent from './Pause.svelte';
import TimerResetComponent from './Reset.svelte';
import TimerStatusComponent from './Status.svelte';

export const TimerRoot = TimerRootComponent;
export type TimerRootProps = ComponentProps<typeof TimerRootComponent>;

export const TimerValue = TimerValueComponent;
export type TimerValueProps = ComponentProps<typeof TimerValueComponent>;

export const TimerStart = TimerStartComponent;
export type TimerStartProps = ComponentProps<typeof TimerStartComponent>;

export const TimerPause = TimerPauseComponent;
export type TimerPauseProps = ComponentProps<typeof TimerPauseComponent>;

export const TimerReset = TimerResetComponent;
export type TimerResetProps = ComponentProps<typeof TimerResetComponent>;

export const TimerStatus = TimerStatusComponent;
export type TimerStatusProps = ComponentProps<typeof TimerStatusComponent>;

export const TimerProvider = TimerRoot;
export const Timer = Object.assign(TimerRoot, { Provider: TimerProvider, Root: TimerRoot, Value: TimerValue, Start: TimerStart, Pause: TimerPause, Reset: TimerReset, Status: TimerStatus });
