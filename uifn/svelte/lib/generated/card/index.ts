import type { ComponentProps } from 'svelte';
import CardRootComponent from './Root.svelte';
import CardHeaderComponent from './Header.svelte';
import CardTitleComponent from './Title.svelte';
import CardDescriptionComponent from './Description.svelte';
import CardActionComponent from './Action.svelte';
import CardContentComponent from './Content.svelte';
import CardFooterComponent from './Footer.svelte';

export const CardRoot = CardRootComponent;
export type CardRootProps = ComponentProps<typeof CardRootComponent>;

export const CardHeader = CardHeaderComponent;
export type CardHeaderProps = ComponentProps<typeof CardHeaderComponent>;

export const CardTitle = CardTitleComponent;
export type CardTitleProps = ComponentProps<typeof CardTitleComponent>;

export const CardDescription = CardDescriptionComponent;
export type CardDescriptionProps = ComponentProps<typeof CardDescriptionComponent>;

export const CardAction = CardActionComponent;
export type CardActionProps = ComponentProps<typeof CardActionComponent>;

export const CardContent = CardContentComponent;
export type CardContentProps = ComponentProps<typeof CardContentComponent>;

export const CardFooter = CardFooterComponent;
export type CardFooterProps = ComponentProps<typeof CardFooterComponent>;

export const CardProvider = CardRoot;
export const Card = Object.assign(CardRoot, { Provider: CardProvider, Root: CardRoot, Header: CardHeader, Title: CardTitle, Description: CardDescription, Action: CardAction, Content: CardContent, Footer: CardFooter });
