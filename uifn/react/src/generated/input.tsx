'use client';

import * as React from 'react';
import { InputContract, type InputProps, type InputContractParts } from '@uifn/core/primitives/input';
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

const InputContext = React.createContext<ReactPrimitiveBridge<InputProps> | null>(null);
const InputDefinition: ReactPrimitiveDefinition<InputProps> = {
  name: 'Input',
  family: 'forms-input',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["type","value","defaultValue","name","disabled","readOnly","required","invalid"],
  context: InputContext,
  contract: InputContract as never,
};

export type InputRootProps = ReactPrimitiveRootProps<InputProps, 'input'>;
export const InputRoot = React.forwardRef<React.ElementRef<'input'>, InputRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={InputDefinition} element="input" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
InputRoot.displayName = 'InputRoot';



export const InputProvider = InputRoot;
export function useInput(inputs: InputProps = {} as InputProps): ReactPrimitiveHookResult<ReturnType<typeof InputContract.getState>, Record<string, never>> {
  return useReactPrimitive(InputDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof InputContract.getState>, Record<string, never>>;
}
export const Input = Object.assign(InputRoot, { Provider: InputProvider, Root: InputRoot });
