import { createContext, type JSX } from 'solid-js';
import { createToggleController, type ToggleProps, type ToggleController } from '@uifn/core/primitives/toggle';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ToggleContext = createContext<SolidPrimitiveContextValue<ToggleProps>>();
export const ToggleDefinition: SolidPrimitiveDefinition<ToggleProps> = {
  name: 'Toggle',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["pressed","defaultPressed","disabled"],
  context: ToggleContext,
  createController: createToggleController as never,
};

function ToggleRootElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ToggleRootProps = SolidPrimitiveRootProps<ToggleProps, 'button'>;
export function ToggleRoot(props: ToggleRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ToggleDefinition} element="button" renderElement={ToggleRootElement as never} hydrationId={hydrationId} props={props as never} />;
}



export const ToggleProvider = ToggleRoot;
export const Toggle = /* @__PURE__ */ Object.assign(ToggleRoot, { Provider: ToggleProvider, Root: ToggleRoot });
