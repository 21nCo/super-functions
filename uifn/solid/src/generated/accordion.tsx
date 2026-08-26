import { createContext, type JSX } from 'solid-js';
import { createAccordionController, type AccordionProps, type AccordionController } from '@uifn/core/primitives/accordion';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const AccordionContext = createContext<SolidPrimitiveContextValue<AccordionProps>>();
export const AccordionDefinition: SolidPrimitiveDefinition<AccordionProps> = {
  name: 'Accordion',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","multiple","collapsible","disabled","type"],
  context: AccordionContext,
  createController: createAccordionController as never,
};

function AccordionRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AccordionRootProps = SolidPrimitiveRootProps<AccordionProps, 'div'>;
export function AccordionRoot(props: AccordionRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={AccordionDefinition} element="div" renderElement={AccordionRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function AccordionItemElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AccordionItemProps = SolidPrimitivePartProps<AccordionController['parts']['item'], 'div', true>;
export function AccordionItem(props: AccordionItemProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AccordionDefinition as never}
      part="item"
      element="div"
      renderElement={AccordionItemElement as never}
      many={true}
      props={props as never}
    />
  );
}

function AccordionHeaderElement(props: JSX.IntrinsicElements['h2']): JSX.Element {
  return <h2 {...props} />;
}

export type AccordionHeaderProps = SolidPrimitivePartProps<AccordionController['parts']['header'], 'h2', true>;
export function AccordionHeader(props: AccordionHeaderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AccordionDefinition as never}
      part="header"
      element="h2"
      renderElement={AccordionHeaderElement as never}
      many={true}
      props={props as never}
    />
  );
}

function AccordionTriggerElement(props: JSX.IntrinsicElements['button']): JSX.Element {
  return <button {...props} />;
}

export type AccordionTriggerProps = SolidPrimitivePartProps<AccordionController['parts']['trigger'], 'button', true>;
export function AccordionTrigger(props: AccordionTriggerProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AccordionDefinition as never}
      part="trigger"
      element="button"
      renderElement={AccordionTriggerElement as never}
      many={true}
      props={props as never}
    />
  );
}

function AccordionContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type AccordionContentProps = SolidPrimitivePartProps<AccordionController['parts']['content'], 'div', true>;
export function AccordionContent(props: AccordionContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AccordionDefinition as never}
      part="content"
      element="div"
      renderElement={AccordionContentElement as never}
      many={true}
      props={props as never}
    />
  );
}

function AccordionIndicatorElement(props: JSX.IntrinsicElements['span']): JSX.Element {
  return <span {...props} />;
}

export type AccordionIndicatorProps = SolidPrimitivePartProps<AccordionController['parts']['indicator'], 'span', true>;
export function AccordionIndicator(props: AccordionIndicatorProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={AccordionDefinition as never}
      part="indicator"
      element="span"
      renderElement={AccordionIndicatorElement as never}
      many={true}
      props={props as never}
    />
  );
}

export const AccordionProvider = AccordionRoot;
export const Accordion = /* @__PURE__ */ Object.assign(AccordionRoot, { Provider: AccordionProvider, Root: AccordionRoot, Item: AccordionItem, Header: AccordionHeader, Trigger: AccordionTrigger, Content: AccordionContent, Indicator: AccordionIndicator });
