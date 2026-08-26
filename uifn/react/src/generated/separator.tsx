'use client';

import * as React from 'react';
import { SeparatorContract, type SeparatorProps, type SeparatorContractParts } from '@uifn/core/primitives/separator';
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

const SeparatorContext = React.createContext<ReactPrimitiveBridge<SeparatorProps> | null>(null);
const SeparatorDefinition: ReactPrimitiveDefinition<SeparatorProps> = {
  name: 'Separator',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["orientation","decorative"],
  context: SeparatorContext,
  contract: SeparatorContract as never,
};

export type SeparatorRootProps = ReactPrimitiveRootProps<SeparatorProps, 'div'>;
export const SeparatorRoot = React.forwardRef<React.ElementRef<'div'>, SeparatorRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SeparatorDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SeparatorRoot.displayName = 'SeparatorRoot';



export const SeparatorProvider = SeparatorRoot;
export function useSeparator(inputs: SeparatorProps = {} as SeparatorProps): ReactPrimitiveHookResult<ReturnType<typeof SeparatorContract.getState>, Record<string, never>> {
  return useReactPrimitive(SeparatorDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof SeparatorContract.getState>, Record<string, never>>;
}
export const Separator = Object.assign(SeparatorRoot, { Provider: SeparatorProvider, Root: SeparatorRoot });
