import { createContext, type JSX } from 'solid-js';
import { InputGroupContract, type InputGroupProps, type InputGroupContractParts } from '@uifn/core/primitives/input-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const InputGroupContext = createContext<SolidPrimitiveContextValue<InputGroupProps>>();
export const InputGroupDefinition: SolidPrimitiveDefinition<InputGroupProps> = {
  name: 'InputGroup',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  context: InputGroupContext,
  contract: InputGroupContract as never,
};

function InputGroupRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type InputGroupRootProps = SolidPrimitiveRootProps<InputGroupProps, 'div'>;
export function InputGroupRoot(props: InputGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={InputGroupDefinition} element="div" renderElement={InputGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function InputGroupAddonElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type InputGroupAddonProps = SolidPrimitivePartProps<InputGroupContractParts['addon'], 'div', true>;
export function InputGroupAddon(props: InputGroupAddonProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="addon"
      element="div"
      renderElement={InputGroupAddonElement as never}
      many={true}
      props={props as never}
    />
  );
}

function InputGroupTextElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type InputGroupTextProps = SolidPrimitivePartProps<InputGroupContractParts['text'], 'span', true>;
export function InputGroupText(props: InputGroupTextProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="text"
      element="span"
      renderElement={InputGroupTextElement as never}
      many={true}
      props={props as never}
    />
  );
}

function InputGroupControlElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type InputGroupControlProps = SolidPrimitivePartProps<InputGroupContractParts['control'], 'div', false>;
export function InputGroupControl(props: InputGroupControlProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="control"
      element="div"
      renderElement={InputGroupControlElement as never}
      many={false}
      props={props as never}
    />
  );
}

function InputGroupInputElement(props: JSX.IntrinsicElements['input']): JSX.Element {
  return <input {...props} />;
}

export type InputGroupInputProps = SolidPrimitivePartProps<InputGroupContractParts['input'], 'input', false>;
export function InputGroupInput(props: InputGroupInputProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="input"
      element="input"
      renderElement={InputGroupInputElement as never}
      many={false}
      props={props as never}
    />
  );
}

function InputGroupTextareaElement(props: JSX.IntrinsicElements['textarea']): JSX.Element {
  return <textarea {...props} />;
}

export type InputGroupTextareaProps = SolidPrimitivePartProps<InputGroupContractParts['textarea'], 'textarea', false>;
export function InputGroupTextarea(props: InputGroupTextareaProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="textarea"
      element="textarea"
      renderElement={InputGroupTextareaElement as never}
      many={false}
      props={props as never}
    />
  );
}

function InputGroupButtonElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type InputGroupButtonProps = SolidPrimitivePartProps<InputGroupContractParts['button'], 'button', true>;
export function InputGroupButton(props: InputGroupButtonProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={InputGroupDefinition as never}
      part="button"
      element="button"
      renderElement={InputGroupButtonElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const InputGroupProvider = InputGroupRoot;
export const InputGroup = /* @__PURE__ */ Object.assign(InputGroupRoot, { Provider: InputGroupProvider, Root: InputGroupRoot, Addon: InputGroupAddon, Text: InputGroupText, Control: InputGroupControl, Input: InputGroupInput, Textarea: InputGroupTextarea, Button: InputGroupButton });
