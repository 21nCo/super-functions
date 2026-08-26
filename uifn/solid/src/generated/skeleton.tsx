import { createContext, type JSX } from 'solid-js';
import { SkeletonContract, type SkeletonProps, type SkeletonContractParts } from '@uifn/core/primitives/skeleton';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SkeletonContext = createContext<SolidPrimitiveContextValue<SkeletonProps>>();
export const SkeletonDefinition: SolidPrimitiveDefinition<SkeletonProps> = {
  name: 'Skeleton',
  family: 'status-feedback',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["visible"],
  context: SkeletonContext,
  contract: SkeletonContract as never,
};

function SkeletonRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SkeletonRootProps = SolidPrimitiveRootProps<SkeletonProps, 'div'>;
export function SkeletonRoot(props: SkeletonRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SkeletonDefinition} element="div" renderElement={SkeletonRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const SkeletonProvider = SkeletonRoot;
export const Skeleton = /* @__PURE__ */ Object.assign(SkeletonRoot, { Provider: SkeletonProvider, Root: SkeletonRoot });
