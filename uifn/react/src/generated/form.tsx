'use client';

import * as React from 'react';
import { FormContract, type FormProps, type FormContractParts } from '@uifn/core/primitives/form';
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

const FormContext = React.createContext<ReactPrimitiveBridge<FormProps> | null>(null);
const FormDefinition: ReactPrimitiveDefinition<FormProps> = {
  name: 'Form',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["noValidate","disabled"],
  context: FormContext,
  contract: FormContract as never,
};

export type FormRootProps = ReactPrimitiveRootProps<FormProps, 'form'>;
export const FormRoot = React.forwardRef<React.ElementRef<'form'>, FormRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={FormDefinition} element="form" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FormRoot.displayName = 'FormRoot';

export type FormErrorSummaryProps = ReactPrimitivePartProps<FormContractParts['errorSummary'], 'div', false>;
export const FormErrorSummary = React.forwardRef<React.ElementRef<'div'>, FormErrorSummaryProps>((props, ref) => (
  <ReactPrimitivePart definition={FormDefinition as never} part="errorSummary" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FormErrorSummary.displayName = 'FormErrorSummary';

export type FormActionsProps = ReactPrimitivePartProps<FormContractParts['actions'], 'div', false>;
export const FormActions = React.forwardRef<React.ElementRef<'div'>, FormActionsProps>((props, ref) => (
  <ReactPrimitivePart definition={FormDefinition as never} part="actions" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FormActions.displayName = 'FormActions';

export const FormProvider = FormRoot;
export function useForm(inputs: FormProps = {} as FormProps): ReactPrimitiveHookResult<ReturnType<typeof FormContract.getState>, Record<string, never>> {
  return useReactPrimitive(FormDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof FormContract.getState>, Record<string, never>>;
}
export const Form = Object.assign(FormRoot, { Provider: FormProvider, Root: FormRoot, ErrorSummary: FormErrorSummary, Actions: FormActions });
