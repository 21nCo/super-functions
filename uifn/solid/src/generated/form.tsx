import { createContext, type JSX } from 'solid-js';
import { FormContract, type FormProps, type FormContractParts } from '@uifn/core/primitives/form';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const FormContext = createContext<SolidPrimitiveContextValue<FormProps>>();
export const FormDefinition: SolidPrimitiveDefinition<FormProps> = {
  name: 'Form',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["noValidate","disabled"],
  context: FormContext,
  contract: FormContract as never,
};

function FormRootElement(props: JSX.IntrinsicElements['form']): JSX.Element {
  return <form {...props} />;
}

export type FormRootProps = SolidPrimitiveRootProps<FormProps, 'form'>;
export function FormRoot(props: FormRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={FormDefinition} element="form" renderElement={FormRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function FormErrorSummaryElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FormErrorSummaryProps = SolidPrimitivePartProps<FormContractParts['errorSummary'], 'div', false>;
export function FormErrorSummary(props: FormErrorSummaryProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FormDefinition as never}
      part="errorSummary"
      element="div"
      renderElement={FormErrorSummaryElement as never}
      many={false}
      props={props as never}
    />
  );
}

function FormActionsElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type FormActionsProps = SolidPrimitivePartProps<FormContractParts['actions'], 'div', false>;
export function FormActions(props: FormActionsProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={FormDefinition as never}
      part="actions"
      element="div"
      renderElement={FormActionsElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const FormProvider = FormRoot;
export const Form = /* @__PURE__ */ Object.assign(FormRoot, { Provider: FormProvider, Root: FormRoot, ErrorSummary: FormErrorSummary, Actions: FormActions });
