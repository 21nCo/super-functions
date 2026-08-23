'use client';

import * as React from 'react';
import { FieldContract, type FieldProps, type FieldContractParts } from '@uifn/core/primitives/field';
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

const FieldContext = React.createContext<ReactPrimitiveBridge<FieldProps> | null>(null);
const FieldDefinition: ReactPrimitiveDefinition<FieldProps> = {
  name: 'Field',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["name","disabled","readOnly","required","invalid"],
  context: FieldContext,
  contract: FieldContract as never,
};

export type FieldRootProps = ReactPrimitiveRootProps<FieldProps, 'div'>;
export const FieldRoot = React.forwardRef<React.ElementRef<'div'>, FieldRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={FieldDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldRoot.displayName = 'FieldRoot';

export type FieldLabelProps = ReactPrimitivePartProps<FieldContractParts['label'], 'label', false>;
export const FieldLabel = React.forwardRef<React.ElementRef<'label'>, FieldLabelProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldDefinition as never} part="label" element="label" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldLabel.displayName = 'FieldLabel';

export type FieldControlProps = ReactPrimitivePartProps<FieldContractParts['control'], 'div', false>;
export const FieldControl = React.forwardRef<React.ElementRef<'div'>, FieldControlProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldDefinition as never} part="control" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldControl.displayName = 'FieldControl';

export type FieldDescriptionProps = ReactPrimitivePartProps<FieldContractParts['description'], 'div', false>;
export const FieldDescription = React.forwardRef<React.ElementRef<'div'>, FieldDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldDefinition as never} part="description" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldDescription.displayName = 'FieldDescription';

export type FieldErrorProps = ReactPrimitivePartProps<FieldContractParts['error'], 'div', false>;
export const FieldError = React.forwardRef<React.ElementRef<'div'>, FieldErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldError.displayName = 'FieldError';

export type FieldRequiredIndicatorProps = ReactPrimitivePartProps<FieldContractParts['requiredIndicator'], 'span', false>;
export const FieldRequiredIndicator = React.forwardRef<React.ElementRef<'span'>, FieldRequiredIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldDefinition as never} part="requiredIndicator" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldRequiredIndicator.displayName = 'FieldRequiredIndicator';

export const FieldProvider = FieldRoot;
export function useField(inputs: FieldProps = {} as FieldProps): ReactPrimitiveHookResult<ReturnType<typeof FieldContract.getState>, Record<string, never>> {
  return useReactPrimitive(FieldDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof FieldContract.getState>, Record<string, never>>;
}
export const Field = Object.assign(FieldRoot, { Provider: FieldProvider, Root: FieldRoot, Label: FieldLabel, Control: FieldControl, Description: FieldDescription, Error: FieldError, RequiredIndicator: FieldRequiredIndicator });
