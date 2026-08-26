import type { ComponentProps } from 'svelte';
import FieldsetRootComponent from './Root.svelte';
import FieldsetLegendComponent from './Legend.svelte';
import FieldsetContentComponent from './Content.svelte';
import FieldsetDescriptionComponent from './Description.svelte';
import FieldsetErrorComponent from './Error.svelte';

export const FieldsetRoot = FieldsetRootComponent;
export type FieldsetRootProps = ComponentProps<typeof FieldsetRootComponent>;

export const FieldsetLegend = FieldsetLegendComponent;
export type FieldsetLegendProps = ComponentProps<typeof FieldsetLegendComponent>;

export const FieldsetContent = FieldsetContentComponent;
export type FieldsetContentProps = ComponentProps<typeof FieldsetContentComponent>;

export const FieldsetDescription = FieldsetDescriptionComponent;
export type FieldsetDescriptionProps = ComponentProps<typeof FieldsetDescriptionComponent>;

export const FieldsetError = FieldsetErrorComponent;
export type FieldsetErrorProps = ComponentProps<typeof FieldsetErrorComponent>;

export const FieldsetProvider = FieldsetRoot;
export const Fieldset = Object.assign(FieldsetRoot, { Provider: FieldsetProvider, Root: FieldsetRoot, Legend: FieldsetLegend, Content: FieldsetContent, Description: FieldsetDescription, Error: FieldsetError });
