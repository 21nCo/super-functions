import { createContext, type JSX } from 'solid-js';
import { ButtonContract, type ButtonProps, type ButtonContractParts } from '@uifn/core/primitives/button';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ButtonContext = createContext<SolidPrimitiveContextValue<ButtonProps>>();
export const ButtonDefinition: SolidPrimitiveDefinition<ButtonProps> = {
  name: 'Button',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","disabled","loading","pressed"],
  context: ButtonContext,
  contract: ButtonContract as never,
};

function ButtonRootElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ButtonRootProps = SolidPrimitiveRootProps<ButtonProps, 'button'>;
export function ButtonRoot(props: ButtonRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ButtonDefinition} element="button" renderElement={ButtonRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ButtonIconElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ButtonIconProps = SolidPrimitivePartProps<ButtonContractParts['icon'], 'span', false>;
export function ButtonIcon(props: ButtonIconProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ButtonDefinition as never}
      part="icon"
      element="span"
      renderElement={ButtonIconElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ButtonLabelElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ButtonLabelProps = SolidPrimitivePartProps<ButtonContractParts['label'], 'span', false>;
export function ButtonLabel(props: ButtonLabelProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ButtonDefinition as never}
      part="label"
      element="span"
      renderElement={ButtonLabelElement as never}
      many={false}
      props={props as never}
    />
  );
}

function ButtonSpinnerElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type ButtonSpinnerProps = SolidPrimitivePartProps<ButtonContractParts['spinner'], 'span', false>;
export function ButtonSpinner(props: ButtonSpinnerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ButtonDefinition as never}
      part="spinner"
      element="span"
      renderElement={ButtonSpinnerElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const ButtonProvider = ButtonRoot;
export const Button = /* @__PURE__ */ Object.assign(ButtonRoot, { Provider: ButtonProvider, Root: ButtonRoot, Icon: ButtonIcon, Label: ButtonLabel, Spinner: ButtonSpinner });
