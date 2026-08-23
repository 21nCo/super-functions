import { createContext, type JSX } from 'solid-js';
import { FieldsetContract, type FieldsetProps, type FieldsetContractParts } from '@uifn/core/primitives/fieldset';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const FieldsetContext = createContext<SolidPrimitiveContextValue<FieldsetProps>>();
export const FieldsetDefinition: SolidPrimitiveDefinition<FieldsetProps> = {
  name: 'Fieldset',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  context: FieldsetContext,
  contract: FieldsetContract as never,
};

function FieldsetRootElement(props: JSX.IntrinsicElements['fieldset']): JSX.Element {
  return <fieldset {...props} />;
}

export type FieldsetRootProps = SolidPrimitiveRootProps<FieldsetProps, 'fieldset'>;
export function FieldsetRoot(props: FieldsetRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={FieldsetDefinition} element="fieldset" renderElement={FieldsetRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function FieldsetLegendElement(props: JSX.IntrinsicElements['legend']): JSX.Element {
  return <legend {...props} />;
}

export type FieldsetLegendProps = SolidPrimitivePartProps<FieldsetContractParts['legend'], 'legend', false>;
export function FieldsetLegend(props: FieldsetLegendProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldsetDefinition as never}
      part="legend"
      element="legend"
      renderElement={FieldsetLegendElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldsetContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldsetContentProps = SolidPrimitivePartProps<FieldsetContractParts['content'], 'div', false>;
export function FieldsetContent(props: FieldsetContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldsetDefinition as never}
      part="content"
      element="div"
      renderElement={FieldsetContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldsetDescriptionElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldsetDescriptionProps = SolidPrimitivePartProps<FieldsetContractParts['description'], 'div', false>;
export function FieldsetDescription(props: FieldsetDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldsetDefinition as never}
      part="description"
      element="div"
      renderElement={FieldsetDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FieldsetErrorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FieldsetErrorProps = SolidPrimitivePartProps<FieldsetContractParts['error'], 'div', false>;
export function FieldsetError(props: FieldsetErrorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FieldsetDefinition as never}
      part="error"
      element="div"
      renderElement={FieldsetErrorElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const FieldsetProvider = FieldsetRoot;
export const Fieldset = /* @__PURE__ */ Object.assign(FieldsetRoot, { Provider: FieldsetProvider, Root: FieldsetRoot, Legend: FieldsetLegend, Content: FieldsetContent, Description: FieldsetDescription, Error: FieldsetError });
