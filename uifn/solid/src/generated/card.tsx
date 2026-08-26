import { createContext, type JSX } from 'solid-js';
import { CardContract, type CardProps, type CardContractParts } from '@uifn/core/primitives/card';
import {
  createSolidPrimitiveInstanceId,
  SolidPrimitivePart,
  SolidPrimitiveRoot,
  type SolidPrimitiveContextValue,
  type SolidPrimitiveDefinition,
  type SolidPrimitivePartProps,
  type SolidPrimitiveRootProps,
} from '../internal/compound.jsx';

const CardContext = createContext<SolidPrimitiveContextValue<CardProps>>();
export const CardDefinition: SolidPrimitiveDefinition<CardProps> = {
  name: 'Card',
  family: 'static-foundation',
  kind: 'typed-static-contract',
  rootPart: 'root',
  inputNames: ["elevated"],
  context: CardContext,
  contract: CardContract as never,
};

function CardRootElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CardRootProps = SolidPrimitiveRootProps<CardProps, 'div'>;
export function CardRoot(props: CardRootProps): JSX.Element {
  const hydrationId = createSolidPrimitiveInstanceId();
  return <SolidPrimitiveRoot definition={CardDefinition} element="div" renderElement={CardRootElement as never} hydrationId={hydrationId} props={props as never} />;
}

function CardHeaderElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CardHeaderProps = SolidPrimitivePartProps<CardContractParts['header'], 'div', false>;
export function CardHeader(props: CardHeaderProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="header"
      element="div"
      renderElement={CardHeaderElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CardTitleElement(props: JSX.IntrinsicElements['h3']): JSX.Element {
  return <h3 {...props} />;
}

export type CardTitleProps = SolidPrimitivePartProps<CardContractParts['title'], 'h3', false>;
export function CardTitle(props: CardTitleProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="title"
      element="h3"
      renderElement={CardTitleElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CardDescriptionElement(props: JSX.IntrinsicElements['p']): JSX.Element {
  return <p {...props} />;
}

export type CardDescriptionProps = SolidPrimitivePartProps<CardContractParts['description'], 'p', false>;
export function CardDescription(props: CardDescriptionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="description"
      element="p"
      renderElement={CardDescriptionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CardActionElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CardActionProps = SolidPrimitivePartProps<CardContractParts['action'], 'div', false>;
export function CardAction(props: CardActionProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="action"
      element="div"
      renderElement={CardActionElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CardContentElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CardContentProps = SolidPrimitivePartProps<CardContractParts['content'], 'div', false>;
export function CardContent(props: CardContentProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="content"
      element="div"
      renderElement={CardContentElement as never}
      many={false}
      props={props as never}
    />
  );
}

function CardFooterElement(props: JSX.IntrinsicElements['div']): JSX.Element {
  return <div {...props} />;
}

export type CardFooterProps = SolidPrimitivePartProps<CardContractParts['footer'], 'div', false>;
export function CardFooter(props: CardFooterProps): JSX.Element {
  return (
    <SolidPrimitivePart
      definition={CardDefinition as never}
      part="footer"
      element="div"
      renderElement={CardFooterElement as never}
      many={false}
      props={props as never}
    />
  );
}

export const CardProvider = CardRoot;
export const Card = /* @__PURE__ */ Object.assign(CardRoot, { Provider: CardProvider, Root: CardRoot, Header: CardHeader, Title: CardTitle, Description: CardDescription, Action: CardAction, Content: CardContent, Footer: CardFooter });
