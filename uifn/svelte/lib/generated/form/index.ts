import type { ComponentProps } from 'svelte';
import FormRootComponent from './Root.svelte';
import FormErrorSummaryComponent from './ErrorSummary.svelte';
import FormActionsComponent from './Actions.svelte';

export const FormRoot = FormRootComponent;
export type FormRootProps = ComponentProps<typeof FormRootComponent>;

export const FormErrorSummary = FormErrorSummaryComponent;
export type FormErrorSummaryProps = ComponentProps<typeof FormErrorSummaryComponent>;

export const FormActions = FormActionsComponent;
export type FormActionsProps = ComponentProps<typeof FormActionsComponent>;

export const FormProvider = FormRoot;
export const Form = Object.assign(FormRoot, { Provider: FormProvider, Root: FormRoot, ErrorSummary: FormErrorSummary, Actions: FormActions });
