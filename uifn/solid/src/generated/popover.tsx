import { createContext, type JSX } from 'solid-js';
import { createPopoverController, type PopoverProps, type PopoverController } from '@uifn/core/primitives/popover';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const PopoverContext = createContext<SolidPrimitiveContextValue<PopoverProps>>();
export const PopoverDefinition: SolidPrimitiveDefinition<PopoverProps> = {
  name: 'Popover',
  family: 'modal-overlay',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["open","defaultOpen","modal","placement","closeOnEscape","closeOnInteractOutside"],
  context: PopoverContext,
  createController: createPopoverController as never,
};

function PopoverRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PopoverRootProps = SolidPrimitiveRootProps<PopoverProps, 'div'>;
export function PopoverRoot(props: PopoverRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={PopoverDefinition} element="div" renderElement={PopoverRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function PopoverAnchorElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PopoverAnchorProps = SolidPrimitivePartProps<PopoverController['parts']['anchor'], 'div', false>;
export function PopoverAnchor(props: PopoverAnchorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="anchor"
      element="div"
      renderElement={PopoverAnchorElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PopoverTriggerProps = SolidPrimitivePartProps<PopoverController['parts']['trigger'], 'button', false>;
export function PopoverTrigger(props: PopoverTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="trigger"
      element="button"
      renderElement={PopoverTriggerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverPositionerElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PopoverPositionerProps = SolidPrimitivePartProps<PopoverController['parts']['positioner'], 'div', false>;
export function PopoverPositioner(props: PopoverPositionerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="positioner"
      element="div"
      renderElement={PopoverPositionerElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PopoverContentProps = SolidPrimitivePartProps<PopoverController['parts']['content'], 'div', false>;
export function PopoverContent(props: PopoverContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="content"
      element="div"
      renderElement={PopoverContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverTitleElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type PopoverTitleProps = SolidPrimitivePartProps<PopoverController['parts']['title'], 'h2', false>;
export function PopoverTitle(props: PopoverTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="title"
      element="h2"
      renderElement={PopoverTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type PopoverDescriptionProps = SolidPrimitivePartProps<PopoverController['parts']['description'], 'p', false>;
export function PopoverDescription(props: PopoverDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="description"
      element="p"
      renderElement={PopoverDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverArrowElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type PopoverArrowProps = SolidPrimitivePartProps<PopoverController['parts']['arrow'], 'div', false>;
export function PopoverArrow(props: PopoverArrowProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="arrow"
      element="div"
      renderElement={PopoverArrowElement as never}
      many={false}
      props={props as never}
    />
  );
}

function PopoverCloseElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type PopoverCloseProps = SolidPrimitivePartProps<PopoverController['parts']['close'], 'button', false>;
export function PopoverClose(props: PopoverCloseProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={PopoverDefinition as never}
      part="close"
      element="button"
      renderElement={PopoverCloseElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const PopoverProvider = PopoverRoot;
export const Popover = /* @__PURE__ */ Object.assign(PopoverRoot, { Provider: PopoverProvider, Root: PopoverRoot, Anchor: PopoverAnchor, Trigger: PopoverTrigger, Positioner: PopoverPositioner, Content: PopoverContent, Title: PopoverTitle, Description: PopoverDescription, Arrow: PopoverArrow, Close: PopoverClose });
