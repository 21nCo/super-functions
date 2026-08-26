import { createContext, type JSX } from 'solid-js';
import { createTooltipController, type TooltipProps, type TooltipController } from '@uifn/core/primitives/tooltip';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const TooltipContext = createContext<SolidPrimitiveContextValue<TooltipProps>>();
export const TooltipDefinition: SolidPrimitiveDefinition<TooltipProps> = {
  name: 'Tooltip',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","openDelay","closeDelay","placement","disabled"],
  context: TooltipContext,
  createController: createTooltipController as never,
};

function TooltipRootElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type TooltipRootProps = SolidPrimitiveRootProps<TooltipProps, 'span'>;
export function TooltipRoot(props: TooltipRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={TooltipDefinition} element="span" renderElement={TooltipRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function TooltipTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type TooltipTriggerProps = SolidPrimitivePartProps<TooltipController['parts']['trigger'], 'button', false>;
export function TooltipTrigger(props: TooltipTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TooltipDefinition as never}
      part="trigger"
      element="button"
      renderElement={TooltipTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TooltipPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TooltipPositionerProps = SolidPrimitivePartProps<TooltipController['parts']['positioner'], 'div', false>;
export function TooltipPositioner(props: TooltipPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TooltipDefinition as never}
      part="positioner"
      element="div"
      renderElement={TooltipPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TooltipContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TooltipContentProps = SolidPrimitivePartProps<TooltipController['parts']['content'], 'div', false>;
export function TooltipContent(props: TooltipContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TooltipDefinition as never}
      part="content"
      element="div"
      renderElement={TooltipContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function TooltipArrowElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type TooltipArrowProps = SolidPrimitivePartProps<TooltipController['parts']['arrow'], 'div', false>;
export function TooltipArrow(props: TooltipArrowProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={TooltipDefinition as never}
      part="arrow"
      element="div"
      renderElement={TooltipArrowElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const TooltipProvider = TooltipRoot;
export const Tooltip = /* @__PURE__ */ Object.assign(TooltipRoot, { Provider: TooltipProvider, Root: TooltipRoot, Trigger: TooltipTrigger, Positioner: TooltipPositioner, Content: TooltipContent, Arrow: TooltipArrow });
