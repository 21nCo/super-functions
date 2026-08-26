import { createContext, type JSX } from 'solid-js';
import { BadgeContract, type BadgeProps, type BadgeContractParts } from '@uifn/core/primitives/badge';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const BadgeContext = createContext<SolidPrimitiveContextValue<BadgeProps>>();
export const BadgeDefinition: SolidPrimitiveDefinition<BadgeProps> = {
  name: 'Badge',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["variant"],
  context: BadgeContext,
  contract: BadgeContract as never,
};

function BadgeRootElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type BadgeRootProps = SolidPrimitiveRootProps<BadgeProps, 'span'>;
export function BadgeRoot(props: BadgeRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={BadgeDefinition} element="span" renderElement={BadgeRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const BadgeProvider = BadgeRoot;
export const Badge = /* @__PURE__ */ Object.assign(BadgeRoot, { Provider: BadgeProvider, Root: BadgeRoot });
