import { createContext, type JSX } from 'solid-js';
import { createCollapsibleController, type CollapsibleProps, type CollapsibleController } from '@uifn/core/primitives/collapsible';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CollapsibleContext = createContext<SolidPrimitiveContextValue<CollapsibleProps>>();
export const CollapsibleDefinition: SolidPrimitiveDefinition<CollapsibleProps> = {
  name: 'Collapsible',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","disabled"],
  context: CollapsibleContext,
  createController: createCollapsibleController as never,
};

function CollapsibleRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CollapsibleRootProps = SolidPrimitiveRootProps<CollapsibleProps, 'div'>;
export function CollapsibleRoot(props: CollapsibleRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CollapsibleDefinition} element="div" renderElement={CollapsibleRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CollapsibleTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type CollapsibleTriggerProps = SolidPrimitivePartProps<CollapsibleController['parts']['trigger'], 'button', false>;
export function CollapsibleTrigger(props: CollapsibleTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CollapsibleDefinition as never}
      part="trigger"
      element="button"
      renderElement={CollapsibleTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CollapsibleContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CollapsibleContentProps = SolidPrimitivePartProps<CollapsibleController['parts']['content'], 'div', false>;
export function CollapsibleContent(props: CollapsibleContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CollapsibleDefinition as never}
      part="content"
      element="div"
      renderElement={CollapsibleContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CollapsibleProvider = CollapsibleRoot;
export const Collapsible = /* @__PURE__ */ Object.assign(CollapsibleRoot, { Provider: CollapsibleProvider, Root: CollapsibleRoot, Trigger: CollapsibleTrigger, Content: CollapsibleContent });
