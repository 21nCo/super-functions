import type { ComponentProps } from 'svelte';
import StepsRootComponent from './Root.svelte';
import StepsListComponent from './List.svelte';
import StepsItemComponent from './Item.svelte';
import StepsTriggerComponent from './Trigger.svelte';
import StepsIndicatorComponent from './Indicator.svelte';
import StepsSeparatorComponent from './Separator.svelte';
import StepsContentComponent from './Content.svelte';
import StepsCompletedComponent from './Completed.svelte';

export const StepsRoot = StepsRootComponent;
export type StepsRootProps = ComponentProps<typeof StepsRootComponent>;

export const StepsList = StepsListComponent;
export type StepsListProps = ComponentProps<typeof StepsListComponent>;

export const StepsItem = StepsItemComponent;
export type StepsItemProps = ComponentProps<typeof StepsItemComponent>;

export const StepsTrigger = StepsTriggerComponent;
export type StepsTriggerProps = ComponentProps<typeof StepsTriggerComponent>;

export const StepsIndicator = StepsIndicatorComponent;
export type StepsIndicatorProps = ComponentProps<typeof StepsIndicatorComponent>;

export const StepsSeparator = StepsSeparatorComponent;
export type StepsSeparatorProps = ComponentProps<typeof StepsSeparatorComponent>;

export const StepsContent = StepsContentComponent;
export type StepsContentProps = ComponentProps<typeof StepsContentComponent>;

export const StepsCompleted = StepsCompletedComponent;
export type StepsCompletedProps = ComponentProps<typeof StepsCompletedComponent>;

export const StepsProvider = StepsRoot;
export const Steps = Object.assign(StepsRoot, { Provider: StepsProvider, Root: StepsRoot, List: StepsList, Item: StepsItem, Trigger: StepsTrigger, Indicator: StepsIndicator, Separator: StepsSeparator, Content: StepsContent, Completed: StepsCompleted });
