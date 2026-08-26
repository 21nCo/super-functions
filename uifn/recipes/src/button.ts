import {
  UIFnRecipeError,
  surface,
  type RecipeOutput,
  type SemanticSurface,
  type SurfaceHoverEffect,
} from './surface';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonRecipeOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  surface?: SemanticSurface;
  surfaceDepth?: number;
  hoverEffect?: SurfaceHoverEffect;
}

const BUTTON_VARIANTS = new Set<ButtonVariant>(['primary', 'secondary', 'outline', 'ghost', 'danger']);
const BUTTON_SIZES = new Set<ButtonSize>(['sm', 'md', 'lg']);
const HOVER_CLASSES: Record<SurfaceHoverEffect, string> = {
  tint: 'uifn-hover--tint',
  stripe: 'uifn-hover--stripe',
  border: 'uifn-hover--border',
  lift: 'uifn-hover--lift',
  none: 'uifn-hover--none',
};

export function buttonRecipe(options: ButtonRecipeOptions = {}): RecipeOutput {
  const variant = options.variant ?? 'primary';
  const size = options.size ?? 'md';
  const hoverEffect = options.hoverEffect ?? 'tint';

  if (!BUTTON_VARIANTS.has(variant)) {
    throw new UIFnRecipeError('UIFN_RECIPE_UNKNOWN_VARIANT', 'Unknown button variant.', {
      variant,
    });
  }

  if (!BUTTON_SIZES.has(size)) {
    throw new UIFnRecipeError('UIFN_RECIPE_UNKNOWN_VARIANT', 'Unknown button size.', {
      size,
    });
  }

  if (!HOVER_CLASSES[hoverEffect]) {
    throw new UIFnRecipeError('UIFN_RECIPE_UNKNOWN_VARIANT', 'Unknown button hover effect.', {
      hoverEffect,
    });
  }

  const surfaceOutput = options.surfaceDepth !== undefined
    ? surface({ depth: options.surfaceDepth })
    : surface(options.surface ?? 'canvas');

  return {
    className: `uifn-button uifn-button--${variant} uifn-button--${size} ${HOVER_CLASSES[hoverEffect]}`,
    style: {},
    vars: {
      '--uifn-button-surface': surfaceOutput.vars['--uifn-surface'],
    },
    data: {
      variant,
      size,
      ...(options.surfaceDepth !== undefined ? { surfaceDepth: options.surfaceDepth } : {}),
      hoverEffect,
    },
  };
}

export function buttonTailwindClasses(options: ButtonRecipeOptions = {}): {
  className: string;
  usesCssVars: true;
  tailwindDynamicClassFragments: string[];
} {
  const output = buttonRecipe(options);

  return {
    className: output.className,
    usesCssVars: true,
    tailwindDynamicClassFragments: [],
  };
}
