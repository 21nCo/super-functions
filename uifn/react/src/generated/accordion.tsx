'use client';

import * as React from 'react';
import { createAccordionController, type AccordionProps, type AccordionController } from '@uifn/core/primitives/accordion';
import {
  ReactPrimitivePart,
  ReactPrimitiveRoot,
  useReactPrimitive,
  type ReactPrimitiveBridge,
  type ReactPrimitiveDefinition,
  type ReactPrimitiveHookResult,
  type ReactPrimitivePartProps,
  type ReactPrimitiveRootProps,
} from '../internal/compound';

const AccordionContext = React.createContext<ReactPrimitiveBridge<AccordionProps> | null>(null);
const AccordionDefinition: ReactPrimitiveDefinition<AccordionProps> = {
  name: 'Accordion',
  family: 'disclosure',
  kind: 'interactive-controller',
  rootPart: 'root',
  inputNames: ["value","defaultValue","multiple","collapsible","disabled","type"],
  context: AccordionContext,
  createController: createAccordionController as never,
};

export type AccordionRootProps = ReactPrimitiveRootProps<AccordionProps, 'div'>;
export const AccordionRoot = React.forwardRef<React.ElementRef<'div'>, AccordionRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={AccordionDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionRoot.displayName = 'AccordionRoot';

export type AccordionItemProps = ReactPrimitivePartProps<AccordionController['parts']['item'], 'div', true>;
export const AccordionItem = React.forwardRef<React.ElementRef<'div'>, AccordionItemProps>((props, ref) => (
  <ReactPrimitivePart definition={AccordionDefinition as never} part="item" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionItem.displayName = 'AccordionItem';

export type AccordionHeaderProps = ReactPrimitivePartProps<AccordionController['parts']['header'], 'h2', true>;
export const AccordionHeader = React.forwardRef<React.ElementRef<'h2'>, AccordionHeaderProps>((props, ref) => (
  <ReactPrimitivePart definition={AccordionDefinition as never} part="header" element="h2" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionHeader.displayName = 'AccordionHeader';

export type AccordionTriggerProps = ReactPrimitivePartProps<AccordionController['parts']['trigger'], 'button', true>;
export const AccordionTrigger = React.forwardRef<React.ElementRef<'button'>, AccordionTriggerProps>((props, ref) => (
  <ReactPrimitivePart definition={AccordionDefinition as never} part="trigger" element="button" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionTrigger.displayName = 'AccordionTrigger';

export type AccordionContentProps = ReactPrimitivePartProps<AccordionController['parts']['content'], 'div', true>;
export const AccordionContent = React.forwardRef<React.ElementRef<'div'>, AccordionContentProps>((props, ref) => (
  <ReactPrimitivePart definition={AccordionDefinition as never} part="content" element="div" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionContent.displayName = 'AccordionContent';

export type AccordionIndicatorProps = ReactPrimitivePartProps<AccordionController['parts']['indicator'], 'span', true>;
export const AccordionIndicator = React.forwardRef<React.ElementRef<'span'>, AccordionIndicatorProps>((props, ref) => (
  <ReactPrimitivePart definition={AccordionDefinition as never} part="indicator" element="span" many={true} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
AccordionIndicator.displayName = 'AccordionIndicator';

export const AccordionProvider = AccordionRoot;
export function useAccordion(inputs: AccordionProps = {} as AccordionProps): ReactPrimitiveHookResult<AccordionController['state'], AccordionController['actions']> {
  return useReactPrimitive(AccordionDefinition, inputs) as ReactPrimitiveHookResult<AccordionController['state'], AccordionController['actions']>;
}
export const Accordion = Object.assign(AccordionRoot, { Provider: AccordionProvider, Root: AccordionRoot, Item: AccordionItem, Header: AccordionHeader, Trigger: AccordionTrigger, Content: AccordionContent, Indicator: AccordionIndicator });
