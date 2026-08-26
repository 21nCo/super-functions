import { createContext, type JSX } from 'solid-js';
import { SeparatorContract, type SeparatorProps, type SeparatorContractParts } from '@uifn/core/primitives/separator';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const SeparatorContext = createContext<SolidPrimitiveContextValue<SeparatorProps>>();
export const SeparatorDefinition: SolidPrimitiveDefinition<SeparatorProps> = {
  name: 'Separator',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["orientation","decorative"],
  context: SeparatorContext,
  contract: SeparatorContract as never,
};

function SeparatorRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type SeparatorRootProps = SolidPrimitiveRootProps<SeparatorProps, 'div'>;
export function SeparatorRoot(props: SeparatorRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={SeparatorDefinition} element="div" renderElement={SeparatorRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const SeparatorProvider = SeparatorRoot;
export const Separator = /* @__PURE__ */ Object.assign(SeparatorRoot, { Provider: SeparatorProvider, Root: SeparatorRoot });
