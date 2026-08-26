import { createContext, type JSX } from 'solid-js';
import { createSignaturePadController, type SignaturePadProps, type SignaturePadController } from '@uifn/core/primitives/signature-pad';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SignaturePadContext = createContext<SolidPrimitiveContextValue<SignaturePadProps>>();
export const SignaturePadDefinition: SolidPrimitiveDefinition<SignaturePadProps> = {
  name: 'SignaturePad',
  family: 'range-gesture',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","disabled","readOnly","required"],
  context: SignaturePadContext,
  createController: createSignaturePadController as never,
};

function SignaturePadRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SignaturePadRootProps = SolidPrimitiveRootProps<SignaturePadProps, 'div'>;
export function SignaturePadRoot(props: SignaturePadRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SignaturePadDefinition} element="div" renderElement={SignaturePadRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SignaturePadLabelElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type SignaturePadLabelProps = SolidPrimitivePartProps<SignaturePadController['parts']['label'], 'label', false>;
export function SignaturePadLabel(props: SignaturePadLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="label"
      element="label"
      renderElement={SignaturePadLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SignaturePadCanvasElement(props: JSX.IntrinsicElements['canvas']): JSX.Element {
  return <canvas {...props} />;
}

export type SignaturePadCanvasProps = SolidPrimitivePartProps<SignaturePadController['parts']['canvas'], 'canvas', false>;
export function SignaturePadCanvas(props: SignaturePadCanvasProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="canvas"
      element="canvas"
      renderElement={SignaturePadCanvasElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SignaturePadClearElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SignaturePadClearProps = SolidPrimitivePartProps<SignaturePadController['parts']['clear'], 'button', false>;
export function SignaturePadClear(props: SignaturePadClearProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="clear"
      element="button"
      renderElement={SignaturePadClearElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SignaturePadUndoElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SignaturePadUndoProps = SolidPrimitivePartProps<SignaturePadController['parts']['undo'], 'button', false>;
export function SignaturePadUndo(props: SignaturePadUndoProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="undo"
      element="button"
      renderElement={SignaturePadUndoElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SignaturePadStatusElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SignaturePadStatusProps = SolidPrimitivePartProps<SignaturePadController['parts']['status'], 'div', false>;
export function SignaturePadStatus(props: SignaturePadStatusProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="status"
      element="div"
      renderElement={SignaturePadStatusElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SignaturePadHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type SignaturePadHiddenInputProps = SolidPrimitivePartProps<SignaturePadController['parts']['hiddenInput'], 'input', false>;
export function SignaturePadHiddenInput(props: SignaturePadHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SignaturePadDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={SignaturePadHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const SignaturePadProvider = SignaturePadRoot;
export const SignaturePad = /* @__PURE__ */ Object.assign(SignaturePadRoot, { Provider: SignaturePadProvider, Root: SignaturePadRoot, Label: SignaturePadLabel, Canvas: SignaturePadCanvas, Clear: SignaturePadClear, Undo: SignaturePadUndo, Status: SignaturePadStatus, HiddenInput: SignaturePadHiddenInput });
