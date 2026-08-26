'use client';

import * as React from 'react';
import { TextareaContract, type TextareaProps, type TextareaContractParts } from '@uifn/core/primitives/textarea';
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

const TextareaContext = React.createContext<ReactPrimitiveBridge<TextareaProps> | null>(null);
const TextareaDefinition: ReactPrimitiveDefinition<TextareaProps> = {
  name: 'Textarea',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["value","defaultValue","name","placeholder","rows","disabled","readOnly","required","invalid","resize"],
  context: TextareaContext,
  contract: TextareaContract as never,
};

export type TextareaRootProps = ReactPrimitiveRootProps<TextareaProps, 'textarea'>;
export const TextareaRoot = React.forwardRef<React.ElementRef<'textarea'>, TextareaRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={TextareaDefinition} element="textarea" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
TextareaRoot.displayName = 'TextareaRoot';



export const TextareaProvider = TextareaRoot;
export function useTextarea(inputs: TextareaProps = {} as TextareaProps): ReactPrimitiveHookResult<ReturnType<typeof TextareaContract.getState>, Record<string, never>> {
  return useReactPrimitive(TextareaDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof TextareaContract.getState>, Record<string, never>>;
}
export const Textarea = Object.assign(TextareaRoot, { Provider: TextareaProvider, Root: TextareaRoot });
