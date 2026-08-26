'use client';

import * as React from 'react';
import { BadgeContract, type BadgeProps, type BadgeContractParts } from '@uifn/core/primitives/badge';
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

const BadgeContext = React.createContext<ReactPrimitiveBridge<BadgeProps> | null>(null);
const BadgeDefinition: ReactPrimitiveDefinition<BadgeProps> = {
  name: 'Badge',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["variant"],
  context: BadgeContext,
  contract: BadgeContract as never,
};

export type BadgeRootProps = ReactPrimitiveRootProps<BadgeProps, 'span'>;
export const BadgeRoot = React.forwardRef<React.ElementRef<'span'>, BadgeRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={BadgeDefinition} element="span" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
BadgeRoot.displayName = 'BadgeRoot';



export const BadgeProvider = BadgeRoot;
export function useBadge(inputs: BadgeProps = {} as BadgeProps): ReactPrimitiveHookResult<ReturnType<typeof BadgeContract.getState>, Record<string, never>> {
  return useReactPrimitive(BadgeDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof BadgeContract.getState>, Record<string, never>>;
}
export const Badge = Object.assign(BadgeRoot, { Provider: BadgeProvider, Root: BadgeRoot });
