'use client';

import * as React from 'react';
import { CardContract, type CardProps, type CardContractParts } from '@uifn/core/primitives/card';
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

const CardContext = React.createContext<ReactPrimitiveBridge<CardProps> | null>(null);
const CardDefinition: ReactPrimitiveDefinition<CardProps> = {
  name: 'Card',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["elevated"],
  context: CardContext,
  contract: CardContract as never,
};

export type CardRootProps = ReactPrimitiveRootProps<CardProps, 'div'>;
export const CardRoot = React.forwardRef<React.ElementRef<'div'>, CardRootProps>((props, ref) => (
  <ReactPrimitiveRoot definition={CardDefinition} element="div" forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardRoot.displayName = 'CardRoot';

export type CardHeaderProps = ReactPrimitivePartProps<CardContractParts['header'], 'div', false>;
export const CardHeader = React.forwardRef<React.ElementRef<'div'>, CardHeaderProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="header" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardHeader.displayName = 'CardHeader';

export type CardTitleProps = ReactPrimitivePartProps<CardContractParts['title'], 'h3', false>;
export const CardTitle = React.forwardRef<React.ElementRef<'h3'>, CardTitleProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="title" element="h3" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardTitle.displayName = 'CardTitle';

export type CardDescriptionProps = ReactPrimitivePartProps<CardContractParts['description'], 'p', false>;
export const CardDescription = React.forwardRef<React.ElementRef<'p'>, CardDescriptionProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="description" element="p" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardDescription.displayName = 'CardDescription';

export type CardActionProps = ReactPrimitivePartProps<CardContractParts['action'], 'div', false>;
export const CardAction = React.forwardRef<React.ElementRef<'div'>, CardActionProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="action" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardAction.displayName = 'CardAction';

export type CardContentProps = ReactPrimitivePartProps<CardContractParts['content'], 'div', false>;
export const CardContent = React.forwardRef<React.ElementRef<'div'>, CardContentProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="content" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardContent.displayName = 'CardContent';

export type CardFooterProps = ReactPrimitivePartProps<CardContractParts['footer'], 'div', false>;
export const CardFooter = React.forwardRef<React.ElementRef<'div'>, CardFooterProps>((props, ref) => (
  <ReactPrimitivePart definition={CardDefinition as never} part="footer" element="div" many={false} forwardedRef={ref as React.ForwardedRef<HTMLElement>} props={props as never} />
));
CardFooter.displayName = 'CardFooter';

export const CardProvider = CardRoot;
export function useCard(inputs: CardProps = {} as CardProps): ReactPrimitiveHookResult<ReturnType<typeof CardContract.getState>, Record<string, never>> {
  return useReactPrimitive(CardDefinition, inputs) as ReactPrimitiveHookResult<ReturnType<typeof CardContract.getState>, Record<string, never>>;
}
export const Card = Object.assign(CardRoot, { Provider: CardProvider, Root: CardRoot, Header: CardHeader, Title: CardTitle, Description: CardDescription, Action: CardAction, Content: CardContent, Footer: CardFooter });
