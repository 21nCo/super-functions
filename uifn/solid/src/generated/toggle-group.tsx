import { createContext, type JSX } from 'solid-js';
import { createToggleGroupController, type ToggleGroupProps, type ToggleGroupController } from '@uifn/core/primitives/toggle-group';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const ToggleGroupContext = createContext<SolidPrimitiveContextValue<ToggleGroupProps>>();
export const ToggleGroupDefinition: SolidPrimitiveDefinition<ToggleGroupProps> = {
  name: 'ToggleGroup',
  family: 'selection-collection',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","type","orientation","loop","disabled"],
  context: ToggleGroupContext,
  createController: createToggleGroupController as never,
};

function ToggleGroupRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type ToggleGroupRootProps = SolidPrimitiveRootProps<ToggleGroupProps, 'div'>;
export function ToggleGroupRoot(props: ToggleGroupRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={ToggleGroupDefinition} element="div" renderElement={ToggleGroupRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function ToggleGroupItemElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type ToggleGroupItemProps = SolidPrimitivePartProps<ToggleGroupController['parts']['item'], 'button', true>;
export function ToggleGroupItem(props: ToggleGroupItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={ToggleGroupDefinition as never}
      part="item"
      element="button"
      renderElement={ToggleGroupItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const ToggleGroupProvider = ToggleGroupRoot;
export const ToggleGroup = /* @__PURE__ */ Object.assign(ToggleGroupRoot, { Provider: ToggleGroupProvider, Root: ToggleGroupRoot, Item: ToggleGroupItem });
