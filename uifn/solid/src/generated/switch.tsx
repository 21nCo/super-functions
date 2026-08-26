import { createContext, type JSX } from 'solid-js';
import { createSwitchController, type SwitchProps, type SwitchController } from '@uifn/core/primitives/switch';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SwitchContext = createContext<SolidPrimitiveContextValue<SwitchProps>>();
export const SwitchDefinition: SolidPrimitiveDefinition<SwitchProps> = {
  name: 'Switch',
  family: 'forms-input',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["checked","defaultChecked","name","value","disabled","readOnly","required"],
  context: SwitchContext,
  createController: createSwitchController as never,
};

function SwitchRootElement(props: JSX.IntrinsicElements['label']): JSX.Element {
  return <label {...props} />;
}

export type SwitchRootProps = SolidPrimitiveRootProps<SwitchProps, 'label'>;
export function SwitchRoot(props: SwitchRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SwitchDefinition} element="label" renderElement={SwitchRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function SwitchControlElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type SwitchControlProps = SolidPrimitivePartProps<SwitchController['parts']['control'], 'button', false>;
export function SwitchControl(props: SwitchControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SwitchDefinition as never}
      part="control"
      element="button"
      renderElement={SwitchControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SwitchThumbElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SwitchThumbProps = SolidPrimitivePartProps<SwitchController['parts']['thumb'], 'span', false>;
export function SwitchThumb(props: SwitchThumbProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SwitchDefinition as never}
      part="thumb"
      element="span"
      renderElement={SwitchThumbElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SwitchLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type SwitchLabelProps = SolidPrimitivePartProps<SwitchController['parts']['label'], 'span', false>;
export function SwitchLabel(props: SwitchLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SwitchDefinition as never}
      part="label"
      element="span"
      renderElement={SwitchLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function SwitchHiddenInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type SwitchHiddenInputProps = SolidPrimitivePartProps<SwitchController['parts']['hiddenInput'], 'input', false>;
export function SwitchHiddenInput(props: SwitchHiddenInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={SwitchDefinition as never}
      part="hiddenInput"
      element="input"
      renderElement={SwitchHiddenInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const SwitchProvider = SwitchRoot;
export const Switch = /* @__PURE__ */ Object.assign(SwitchRoot, { Provider: SwitchProvider, Root: SwitchRoot, Control: SwitchControl, Thumb: SwitchThumb, Label: SwitchLabel, HiddenInput: SwitchHiddenInput });
