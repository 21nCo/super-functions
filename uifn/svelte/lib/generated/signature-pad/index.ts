import type { ComponentProps } from 'svelte';
import SignaturePadRootComponent from './Root.svelte';
import SignaturePadLabelComponent from './Label.svelte';
import SignaturePadCanvasComponent from './Canvas.svelte';
import SignaturePadClearComponent from './Clear.svelte';
import SignaturePadUndoComponent from './Undo.svelte';
import SignaturePadStatusComponent from './Status.svelte';
import SignaturePadHiddenInputComponent from './HiddenInput.svelte';

export const SignaturePadRoot = SignaturePadRootComponent;
export type SignaturePadRootProps = ComponentProps<typeof SignaturePadRootComponent>;

export const SignaturePadLabel = SignaturePadLabelComponent;
export type SignaturePadLabelProps = ComponentProps<typeof SignaturePadLabelComponent>;

export const SignaturePadCanvas = SignaturePadCanvasComponent;
export type SignaturePadCanvasProps = ComponentProps<typeof SignaturePadCanvasComponent>;

export const SignaturePadClear = SignaturePadClearComponent;
export type SignaturePadClearProps = ComponentProps<typeof SignaturePadClearComponent>;

export const SignaturePadUndo = SignaturePadUndoComponent;
export type SignaturePadUndoProps = ComponentProps<typeof SignaturePadUndoComponent>;

export const SignaturePadStatus = SignaturePadStatusComponent;
export type SignaturePadStatusProps = ComponentProps<typeof SignaturePadStatusComponent>;

export const SignaturePadHiddenInput = SignaturePadHiddenInputComponent;
export type SignaturePadHiddenInputProps = ComponentProps<typeof SignaturePadHiddenInputComponent>;

export const SignaturePadProvider = SignaturePadRoot;
export const SignaturePad = Object.assign(SignaturePadRoot, { Provider: SignaturePadProvider, Root: SignaturePadRoot, Label: SignaturePadLabel, Canvas: SignaturePadCanvas, Clear: SignaturePadClear, Undo: SignaturePadUndo, Status: SignaturePadStatus, HiddenInput: SignaturePadHiddenInput });
