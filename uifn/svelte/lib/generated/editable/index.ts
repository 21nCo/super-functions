import type { ComponentProps } from 'svelte';
import EditableRootComponent from './Root.svelte';
import EditableLabelComponent from './Label.svelte';
import EditablePreviewComponent from './Preview.svelte';
import EditableInputComponent from './Input.svelte';
import EditableControlComponent from './Control.svelte';
import EditableSubmitComponent from './Submit.svelte';
import EditableCancelComponent from './Cancel.svelte';
import EditableErrorComponent from './Error.svelte';
import EditableHiddenInputComponent from './HiddenInput.svelte';

export const EditableRoot = EditableRootComponent;
export type EditableRootProps = ComponentProps<typeof EditableRootComponent>;

export const EditableLabel = EditableLabelComponent;
export type EditableLabelProps = ComponentProps<typeof EditableLabelComponent>;

export const EditablePreview = EditablePreviewComponent;
export type EditablePreviewProps = ComponentProps<typeof EditablePreviewComponent>;

export const EditableInput = EditableInputComponent;
export type EditableInputProps = ComponentProps<typeof EditableInputComponent>;

export const EditableControl = EditableControlComponent;
export type EditableControlProps = ComponentProps<typeof EditableControlComponent>;

export const EditableSubmit = EditableSubmitComponent;
export type EditableSubmitProps = ComponentProps<typeof EditableSubmitComponent>;

export const EditableCancel = EditableCancelComponent;
export type EditableCancelProps = ComponentProps<typeof EditableCancelComponent>;

export const EditableError = EditableErrorComponent;
export type EditableErrorProps = ComponentProps<typeof EditableErrorComponent>;

export const EditableHiddenInput = EditableHiddenInputComponent;
export type EditableHiddenInputProps = ComponentProps<typeof EditableHiddenInputComponent>;

export const EditableProvider = EditableRoot;
export const Editable = Object.assign(EditableRoot, { Provider: EditableProvider, Root: EditableRoot, Label: EditableLabel, Preview: EditablePreview, Input: EditableInput, Control: EditableControl, Submit: EditableSubmit, Cancel: EditableCancel, Error: EditableError, HiddenInput: EditableHiddenInput });
