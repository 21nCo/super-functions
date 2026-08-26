import type { ComponentProps } from 'svelte';
import AutocompleteRootComponent from './Root.svelte';
import AutocompleteLabelComponent from './Label.svelte';
import AutocompleteControlComponent from './Control.svelte';
import AutocompleteInputComponent from './Input.svelte';
import AutocompleteClearComponent from './Clear.svelte';
import AutocompletePositionerComponent from './Positioner.svelte';
import AutocompleteContentComponent from './Content.svelte';
import AutocompleteItemComponent from './Item.svelte';
import AutocompleteEmptyComponent from './Empty.svelte';

export const AutocompleteRoot = AutocompleteRootComponent;
export type AutocompleteRootProps = ComponentProps<typeof AutocompleteRootComponent>;

export const AutocompleteLabel = AutocompleteLabelComponent;
export type AutocompleteLabelProps = ComponentProps<typeof AutocompleteLabelComponent>;

export const AutocompleteControl = AutocompleteControlComponent;
export type AutocompleteControlProps = ComponentProps<typeof AutocompleteControlComponent>;

export const AutocompleteInput = AutocompleteInputComponent;
export type AutocompleteInputProps = ComponentProps<typeof AutocompleteInputComponent>;

export const AutocompleteClear = AutocompleteClearComponent;
export type AutocompleteClearProps = ComponentProps<typeof AutocompleteClearComponent>;

export const AutocompletePositioner = AutocompletePositionerComponent;
export type AutocompletePositionerProps = ComponentProps<typeof AutocompletePositionerComponent>;

export const AutocompleteContent = AutocompleteContentComponent;
export type AutocompleteContentProps = ComponentProps<typeof AutocompleteContentComponent>;

export const AutocompleteItem = AutocompleteItemComponent;
export type AutocompleteItemProps = ComponentProps<typeof AutocompleteItemComponent>;

export const AutocompleteEmpty = AutocompleteEmptyComponent;
export type AutocompleteEmptyProps = ComponentProps<typeof AutocompleteEmptyComponent>;

export const AutocompleteProvider = AutocompleteRoot;
export const Autocomplete = Object.assign(AutocompleteRoot, { Provider: AutocompleteProvider, Root: AutocompleteRoot, Label: AutocompleteLabel, Control: AutocompleteControl, Input: AutocompleteInput, Clear: AutocompleteClear, Positioner: AutocompletePositioner, Content: AutocompleteContent, Item: AutocompleteItem, Empty: AutocompleteEmpty });
