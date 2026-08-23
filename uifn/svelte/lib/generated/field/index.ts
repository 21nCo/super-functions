import type { ComponentProps } from 'svelte';
import FieldRootComponent from './Root.svelte';
import FieldLabelComponent from './Label.svelte';
import FieldControlComponent from './Control.svelte';
import FieldDescriptionComponent from './Description.svelte';
import FieldErrorComponent from './Error.svelte';
import FieldRequiredIndicatorComponent from './RequiredIndicator.svelte';

export const FieldRoot = FieldRootComponent;
export type FieldRootProps = ComponentProps<typeof FieldRootComponent>;

export const FieldLabel = FieldLabelComponent;
export type FieldLabelProps = ComponentProps<typeof FieldLabelComponent>;

export const FieldControl = FieldControlComponent;
export type FieldControlProps = ComponentProps<typeof FieldControlComponent>;

export const FieldDescription = FieldDescriptionComponent;
export type FieldDescriptionProps = ComponentProps<typeof FieldDescriptionComponent>;

export const FieldError = FieldErrorComponent;
export type FieldErrorProps = ComponentProps<typeof FieldErrorComponent>;

export const FieldRequiredIndicator = FieldRequiredIndicatorComponent;
export type FieldRequiredIndicatorProps = ComponentProps<typeof FieldRequiredIndicatorComponent>;

export const FieldProvider = FieldRoot;
export const Field = Object.assign(FieldRoot, { Provider: FieldProvider, Root: FieldRoot, Label: FieldLabel, Control: FieldControl, Description: FieldDescription, Error: FieldError, RequiredIndicator: FieldRequiredIndicator });
