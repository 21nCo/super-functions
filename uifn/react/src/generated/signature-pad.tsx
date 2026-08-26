'use client';

import * as React from 'react';
import { createSignaturePadController, type SignaturePadProps, type SignaturePadController } from '@uifn/core/primitives/signature-pad';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const SignaturePadContext = React.createContext<ReactPrimitiveBridge<SignaturePadProps> | null>(null);
const SignaturePadDefinition: ReactPrimitiveDefinition<SignaturePadProps> = {
  name: 'SignaturePad',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  context: SignaturePadContext,
  createController: createSignaturePadController as never,
};

export type SignaturePadRootProps = ReactPrimitiveRootProps<SignaturePadProps, 'div'>;
export const SignaturePadRoot = React.forwardRef<React.ElementRef<'div'>, SignaturePadRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SignaturePadDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadRoot.displayName = 'SignaturePadRoot';

export type SignaturePadLabelProps = ReactPrimitivePartProps<SignaturePadController['parts']['label'], 'label', false>;
export const SignaturePadLabel = React.forwardRef<React.ElementRef<'label'>, SignaturePadLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadLabel.displayName = 'SignaturePadLabel';

export type SignaturePadCanvasProps = ReactPrimitivePartProps<SignaturePadController['parts']['canvas'], 'canvas', false>;
export const SignaturePadCanvas = React.forwardRef<React.ElementRef<'canvas'>, SignaturePadCanvasProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="canvas" element="canvas" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadCanvas.displayName = 'SignaturePadCanvas';

export type SignaturePadClearProps = ReactPrimitivePartProps<SignaturePadController['parts']['clear'], 'button', false>;
export const SignaturePadClear = React.forwardRef<React.ElementRef<'button'>, SignaturePadClearProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="clear" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadClear.displayName = 'SignaturePadClear';

export type SignaturePadUndoProps = ReactPrimitivePartProps<SignaturePadController['parts']['undo'], 'button', false>;
export const SignaturePadUndo = React.forwardRef<React.ElementRef<'button'>, SignaturePadUndoProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="undo" element="button" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadUndo.displayName = 'SignaturePadUndo';

export type SignaturePadStatusProps = ReactPrimitivePartProps<SignaturePadController['parts']['status'], 'div', false>;
export const SignaturePadStatus = React.forwardRef<React.ElementRef<'div'>, SignaturePadStatusProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="status" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadStatus.displayName = 'SignaturePadStatus';

export type SignaturePadHiddenInputProps = ReactPrimitivePartProps<SignaturePadController['parts']['hiddenInput'], 'input', false>;
export const SignaturePadHiddenInput = React.forwardRef<React.ElementRef<'input'>, SignaturePadHiddenInputProps>((props, ref) => (
  <ReactPrimitivePart definition={SignaturePadDefinition as never} part="hiddenInput" element="input" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SignaturePadHiddenInput.displayName = 'SignaturePadHiddenInput';

export const SignaturePadProvider = SignaturePadRoot;
export function useSignaturePad(inputs: SignaturePadProps = {} as SignaturePadProps): ReactPrimitiveHookResult<SignaturePadController['state'], SignaturePadController['actions']> {
  return useReactPrimitive(SignaturePadDefinition, inputs) as ReactPrimitiveHookResult<SignaturePadController['state'], SignaturePadController['actions']>;
}
export const SignaturePad = Object.assign(SignaturePadRoot, { Provider: SignaturePadProvider, Root: SignaturePadRoot, Label: SignaturePadLabel, Canvas: SignaturePadCanvas, Clear: SignaturePadClear, Undo: SignaturePadUndo, Status: SignaturePadStatus, HiddenInput: SignaturePadHiddenInput });
