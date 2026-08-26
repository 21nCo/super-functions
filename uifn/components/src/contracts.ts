import { STYLED_COMPONENT_CATALOG } from './generated/catalog';
import {
  openComponentPartRecipe,
  type ComponentRecipeClasses,
  type ComponentRecipeDensity,
  type ComponentRecipeSize,
  type ComponentRecipeStyle,
  type ComponentRecipeStyles,
  type ComponentRecipeVariant,
} from '@uifn/recipes/component';

export type StyledComponentState = 'open' | 'closed' | 'checked' | 'unchecked' | 'mixed' | 'selected' | 'highlighted' | 'invalid' | 'disabled' | 'read-only' | 'loading' | 'dragging' | 'swiping' | 'focus-visible';
export type StyledDensity = ComponentRecipeDensity;
export type StyledVariant = ComponentRecipeVariant;
export type StyledSize = ComponentRecipeSize;
export type StyledInlineStyle = ComponentRecipeStyle;
export type StyledClasses = ComponentRecipeClasses;
export type StyledStyles = ComponentRecipeStyles;

export type StyledContractErrorCode = 'UIFN_STYLED_COMPONENT_UNKNOWN' | 'UIFN_STYLED_PART_UNKNOWN';

export class UIFnStyledContractError extends Error {
  readonly name = 'UIFnStyledContractError';
  constructor(readonly code: StyledContractErrorCode, message: string, readonly details: Record<string, unknown> = {}) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface StyledPartRecipeOptions {
  state?: StyledComponentState;
  density?: StyledDensity;
  variant?: StyledVariant;
  size?: StyledSize;
  unstyled?: boolean;
  className?: string;
  classes?: StyledClasses;
  style?: StyledInlineStyle;
  styles?: StyledStyles;
  vars?: Record<`--uifn-${string}`, string>;
}

export interface StyledComponentProps {
  variant?: StyledVariant;
  size?: StyledSize;
  density?: StyledDensity;
  unstyled?: boolean;
  classes?: StyledClasses;
  styles?: StyledStyles;
  style?: StyledInlineStyle;
}

export function getStyledComponentContract(id: string) {
  const contract = STYLED_COMPONENT_CATALOG.find((entry) => entry.id === id);
  if (!contract) throw new UIFnStyledContractError('UIFN_STYLED_COMPONENT_UNKNOWN', `Unknown styled component: ${id}`, { id });
  return contract;
}

export function mergeStyledClassName(
  primitive: string,
  part: string,
  userClassName?: string,
  options: Pick<StyledPartRecipeOptions, 'variant' | 'size' | 'density' | 'unstyled' | 'classes'> = {},
): string {
  const contract = getStyledComponentContract(primitive);
  if (!contract.parts.some((entry) => entry.id === part)) {
    throw new UIFnStyledContractError('UIFN_STYLED_PART_UNKNOWN', `Unknown styled part: ${primitive}.${part}`, { primitive, part });
  }
  return openComponentPartRecipe(primitive, part, { ...options, className: userClassName }).className;
}

export function createStyledPartRecipe(primitive: string, part: string, options: StyledPartRecipeOptions = {}) {
  const contract = getStyledComponentContract(primitive);
  if (!contract.parts.some((entry) => entry.id === part)) {
    throw new UIFnStyledContractError('UIFN_STYLED_PART_UNKNOWN', `Unknown styled part: ${primitive}.${part}`, { primitive, part });
  }
  return openComponentPartRecipe(primitive, part, options);
}
