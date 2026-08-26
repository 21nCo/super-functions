import { createContext, type JSX } from 'solid-js';
import { AvatarContract, type AvatarProps, type AvatarContractParts } from '@uifn/core/primitives/avatar';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const AvatarContext = createContext<SolidPrimitiveContextValue<AvatarProps>>();
export const AvatarDefinition: SolidPrimitiveDefinition<AvatarProps> = {
  name: 'Avatar',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["src","alt","fallbackDelay"],
  context: AvatarContext,
  contract: AvatarContract as never,
};

function AvatarRootElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type AvatarRootProps = SolidPrimitiveRootProps<AvatarProps, 'span'>;
export function AvatarRoot(props: AvatarRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={AvatarDefinition} element="span" renderElement={AvatarRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function AvatarImageElement(props: JSX.IntrinsicElements['img']): JSX.Element {
  return <img {...props} />;
}

export type AvatarImageProps = SolidPrimitivePartProps<AvatarContractParts['image'], 'img', false>;
export function AvatarImage(props: AvatarImageProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AvatarDefinition as never}
      part="image"
      element="img"
      renderElement={AvatarImageElement as never}
      many={false}
      props={props as never}
    />
  );
}

function AvatarFallbackElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type AvatarFallbackProps = SolidPrimitivePartProps<AvatarContractParts['fallback'], 'span', false>;
export function AvatarFallback(props: AvatarFallbackProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AvatarDefinition as never}
      part="fallback"
      element="span"
      renderElement={AvatarFallbackElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const AvatarProvider = AvatarRoot;
export const Avatar = /* @__PURE__ */ Object.assign(AvatarRoot, { Provider: AvatarProvider, Root: AvatarRoot, Image: AvatarImage, Fallback: AvatarFallback });
