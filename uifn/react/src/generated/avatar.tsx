'use client';

import * as React from 'react';
import { AvatarContract, type AvatarProps, type AvatarContractParts } from '@uifn/core/primitives/avatar';
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

const AvatarContext = React.createContext<ReactPrimitiveBridge<AvatarProps> | null>(null);
const AvatarDefinition: ReactPrimitiveDefinition<AvatarProps> = {
  name: 'Avatar',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["src","alt","fallbackDelay"],
  context: AvatarContext,
  contract: AvatarContract as never,
};

export type AvatarRootProps = ReactPrimitiveRootProps<AvatarProps, 'span'>;
export const AvatarRoot = React.forwardRef<React.ElementRef<'span'>, AvatarRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={AvatarDefinition} element="span" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AvatarRoot.displayName = 'AvatarRoot';

export type AvatarImageProps = ReactPrimitivePartProps<AvatarContractParts['image'], 'img', false>;
export const AvatarImage = React.forwardRef<React.ElementRef<'img'>, AvatarImageProps>((props, ref) => (
  <ReactPrimitivePart definition={AvatarDefinition as never} part="image" element="img" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AvatarImage.displayName = 'AvatarImage';

export type AvatarFallbackProps = ReactPrimitivePartProps<AvatarContractParts['fallback'], 'span', false>;
export const AvatarFallback = React.forwardRef<React.ElementRef<'span'>, AvatarFallbackProps>((props, ref) => (
  <ReactPrimitivePart definition={AvatarDefinition as never} part="fallback" element="span" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AvatarFallback.displayName = 'AvatarFallback';

export const AvatarProvider = AvatarRoot;
export function useAvatar(inputs: AvatarProps): ReactPrimitiveHookResult<ReturnType<typeof AvatarContract.getState>, Record<string, never>> {
  return useReactPrimitive(AvatarDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof AvatarContract.getState>, Record<string, never>>;
}
export const Avatar = Object.assign(AvatarRoot, { Provider: AvatarProvider, Root: AvatarRoot, Image: AvatarImage, Fallback: AvatarFallback });
