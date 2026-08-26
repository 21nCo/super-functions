import { createContext, type JSX } from 'solid-js';
import { createHoverCardController, type CreateHoverCardProps, type HoverCardController } from '@uifn/core/primitives/hover-card';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const HoverCardContext = createContext<SolidPrimitiveContextValue<CreateHoverCardProps>>();
export const HoverCardDefinition: SolidPrimitiveDefinition<CreateHoverCardProps> = {
  name: 'HoverCard',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","openDelay","closeDelay","placement"],
  context: HoverCardContext,
  createController: createHoverCardController as never,
};

function HoverCardRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type HoverCardRootProps = SolidPrimitiveRootProps<CreateHoverCardProps, 'div'>;
export function HoverCardRoot(props: HoverCardRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={HoverCardDefinition} element="div" renderElement={HoverCardRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function HoverCardTriggerElement(props: JSX.IntrinsicElements['a']): JSX.Element {
  return <a {...props} />;
}

export type HoverCardTriggerProps = SolidPrimitivePartProps<HoverCardController['parts']['trigger'], 'a', false>;
export function HoverCardTrigger(props: HoverCardTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={HoverCardDefinition as never}
      part="trigger"
      element="a"
      renderElement={HoverCardTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function HoverCardPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type HoverCardPositionerProps = SolidPrimitivePartProps<HoverCardController['parts']['positioner'], 'div', false>;
export function HoverCardPositioner(props: HoverCardPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={HoverCardDefinition as never}
      part="positioner"
      element="div"
      renderElement={HoverCardPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function HoverCardContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type HoverCardContentProps = SolidPrimitivePartProps<HoverCardController['parts']['content'], 'div', false>;
export function HoverCardContent(props: HoverCardContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={HoverCardDefinition as never}
      part="content"
      element="div"
      renderElement={HoverCardContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function HoverCardArrowElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type HoverCardArrowProps = SolidPrimitivePartProps<HoverCardController['parts']['arrow'], 'div', false>;
export function HoverCardArrow(props: HoverCardArrowProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={HoverCardDefinition as never}
      part="arrow"
      element="div"
      renderElement={HoverCardArrowElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const HoverCardProvider = HoverCardRoot;
export const HoverCard = /* @__PURE__ */ Object.assign(HoverCardRoot, { Provider: HoverCardProvider, Root: HoverCardRoot, Trigger: HoverCardTrigger, Positioner: HoverCardPositioner, Content: HoverCardContent, Arrow: HoverCardArrow });
