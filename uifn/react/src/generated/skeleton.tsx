'use client';

import * as React from 'react';
import { SkeletonContract, type SkeletonProps, type SkeletonContractParts } from '@uifn/core/primitives/skeleton';
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

const SkeletonContext = React.createContext<ReactPrimitiveBridge<SkeletonProps> | null>(null);
const SkeletonDefinition: ReactPrimitiveDefinition<SkeletonProps> = {
  name: 'Skeleton',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["visible"],
  context: SkeletonContext,
  contract: SkeletonContract as never,
};

export type SkeletonRootProps = ReactPrimitiveRootProps<SkeletonProps, 'div'>;
export const SkeletonRoot = React.forwardRef<React.ElementRef<'div'>, SkeletonRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={SkeletonDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
SkeletonRoot.displayName = 'SkeletonRoot';



export const SkeletonProvider = SkeletonRoot;
export function useSkeleton(inputs: SkeletonProps = {} as SkeletonProps): ReactPrimitiveHookResult<ReturnType<typeof SkeletonContract.getState>, Record<string, never>> {
  return useReactPrimitive(SkeletonDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof SkeletonContract.getState>, Record<string, never>>;
}
export const Skeleton = Object.assign(SkeletonRoot, { Provider: SkeletonProvider, Root: SkeletonRoot });
