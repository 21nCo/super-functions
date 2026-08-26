'use client';

import * as React from 'react';
import { FieldsetContract, type FieldsetProps, type FieldsetContractParts } from '@uifn/core/primitives/fieldset';
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

const FieldsetContext = React.createContext<ReactPrimitiveBridge<FieldsetProps> | null>(null);
const FieldsetDefinition: ReactPrimitiveDefinition<FieldsetProps> = {
  name: 'Fieldset',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["disabled","invalid"],
  context: FieldsetContext,
  contract: FieldsetContract as never,
};

export type FieldsetRootProps = ReactPrimitiveRootProps<FieldsetProps, 'fieldset'>;
export const FieldsetRoot = React.forwardRef<React.ElementRef<'fieldset'>, FieldsetRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={FieldsetDefinition} element="fieldset" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldsetRoot.displayName = 'FieldsetRoot';

export type FieldsetLegendProps = ReactPrimitivePartProps<FieldsetContractParts['legend'], 'legend', false>;
export const FieldsetLegend = React.forwardRef<React.ElementRef<'legend'>, FieldsetLegendProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldsetDefinition as never} part="legend" element="legend" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldsetLegend.displayName = 'FieldsetLegend';

export type FieldsetContentProps = ReactPrimitivePartProps<FieldsetContractParts['content'], 'div', false>;
export const FieldsetContent = React.forwardRef<React.ElementRef<'div'>, FieldsetContentProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldsetDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldsetContent.displayName = 'FieldsetContent';

export type FieldsetDescriptionProps = ReactPrimitivePartProps<FieldsetContractParts['description'], 'div', false>;
export const FieldsetDescription = React.forwardRef<React.ElementRef<'div'>, FieldsetDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldsetDefinition as never} part="description" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldsetDescription.displayName = 'FieldsetDescription';

export type FieldsetErrorProps = ReactPrimitivePartProps<FieldsetContractParts['error'], 'div', false>;
export const FieldsetError = React.forwardRef<React.ElementRef<'div'>, FieldsetErrorProps>((props, ref) => (
  <ReactPrimitivePart definition={FieldsetDefinition as never} part="error" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
FieldsetError.displayName = 'FieldsetError';

export const FieldsetProvider = FieldsetRoot;
export function useFieldset(inputs: FieldsetProps = {} as FieldsetProps): ReactPrimitiveHookResult<ReturnType<typeof FieldsetContract.getState>, Record<string, never>> {
  return useReactPrimitive(FieldsetDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof FieldsetContract.getState>, Record<string, never>>;
}
export const Fieldset = Object.assign(FieldsetRoot, { Provider: FieldsetProvider, Root: FieldsetRoot, Legend: FieldsetLegend, Content: FieldsetContent, Description: FieldsetDescription, Error: FieldsetError });
