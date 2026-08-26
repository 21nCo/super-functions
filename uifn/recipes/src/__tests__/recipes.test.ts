import { describe, expect, it } from 'vitest';
import { buttonRecipe, buttonTailwindClasses } from '../button';
import {
  COMPONENT_RECIPE_COUNT,
  COMPONENT_RECIPE_PART_COUNT,
  COMPONENT_RECIPES,
} from '../generated/component-recipes';
import { UIFnRecipeError, surface, surfaceHover } from '../surface';
import { openComponentPartRecipe } from '../component';

describe('style recipes', () => {
  it('provides stable selectors for every public styled component and anatomy part', () => {
    expect(COMPONENT_RECIPE_COUNT).toBe(69);
    expect(COMPONENT_RECIPE_PART_COUNT).toBe(465);
    for (const [component, recipe] of Object.entries(COMPONENT_RECIPES)) {
      expect(recipe.rootSelector).toBe(`[data-uifn-component="${component}"][data-uifn-part="root"]`);
      expect(recipe.cssLayer).toBe('uifn.components');
      expect(Object.keys(recipe.partSelectors).length).toBeGreaterThan(0);
      expect(recipe.stylingProps).toEqual(['variant', 'size', 'density', 'unstyled', 'className', 'classes', 'style', 'styles']);
    }
  });

  it('creates the public open-component recipe consumed by every framework wrapper', () => {
    expect(openComponentPartRecipe('button', 'root', {
      variant: 'outline',
      size: 'lg',
      density: 'compact',
      classes: { root: 'consumer-root' },
      styles: { root: { paddingInline: '1rem' } },
    })).toMatchObject({
      className: 'uifn-button uifn-button__root uifn-button--outline uifn-button--lg uifn-button--density-compact consumer-root',
      style: { paddingInline: '1rem' },
      data: {
        'data-uifn-component': 'button',
        'data-uifn-part': 'root',
        'data-uifn-variant': 'outline',
        'data-uifn-size': 'lg',
        'data-uifn-density': 'compact',
      },
    });
  });

  it('TV-STYLE-004 resolves semantic surface and numeric depth', () => {
    expect(surface({ surface: 'raised' }).vars).toEqual({
      '--uifn-surface': 'var(--uifn-color-surface-raised)',
    });
    expect(surface({ depth: 2 }).vars).toEqual({
      '--uifn-surface': 'var(--uifn-color-surface-depth-2)',
    });
  });

  it('TV-STYLE-004 makes tint the default hover effect and stripe explicit', () => {
    expect(surfaceHover({ surface: 'raised' })).toMatchObject({
      className: 'uifn-surface uifn-hover--tint',
      vars: {
        '--uifn-surface': 'var(--uifn-color-surface-raised)',
        '--uifn-surface-hover': 'var(--uifn-color-surface-raised)',
      },
      data: {
        surface: 'raised',
        hoverEffect: 'tint',
      },
    });

    expect(surfaceHover({ depth: 1, effect: 'stripe' })).toMatchObject({
      className: 'uifn-surface uifn-hover--stripe',
      vars: {
        '--uifn-surface': 'var(--uifn-color-surface-depth-1)',
        '--uifn-surface-hover': 'var(--uifn-color-surface-depth-1)',
      },
      data: {
        surface: 'depth',
        depth: 1,
        hoverEffect: 'stripe',
      },
    });
  });

  it('TV-STYLE-004 negative rejects unsupported depth', () => {
    expect(() => surface({ depth: 99 })).toThrowError(UIFnRecipeError);
    try {
      surface({ depth: 99 });
    } catch (error) {
      expect((error as UIFnRecipeError).code).toBe('UIFN_SURFACE_DEPTH_OUT_OF_RANGE');
    }
  });

  it('TV-STYLE-006 returns all output targets for button recipe', () => {
    expect(buttonRecipe({ variant: 'secondary', size: 'md', surface: 'raised' })).toEqual({
      className: 'uifn-button uifn-button--secondary uifn-button--md uifn-hover--tint',
      style: {},
      vars: {
        '--uifn-button-surface': 'var(--uifn-color-surface-raised)',
      },
      data: {
        variant: 'secondary',
        size: 'md',
        hoverEffect: 'tint',
      },
    });
  });

  it('TV-STYLE-006 supports numeric surface depth in component recipes', () => {
    expect(buttonRecipe({ variant: 'primary', surfaceDepth: 3, hoverEffect: 'border' })).toEqual({
      className: 'uifn-button uifn-button--primary uifn-button--md uifn-hover--border',
      style: {},
      vars: {
        '--uifn-button-surface': 'var(--uifn-color-surface-depth-3)',
      },
      data: {
        variant: 'primary',
        size: 'md',
        surfaceDepth: 3,
        hoverEffect: 'border',
      },
    });
  });

  it('TV-STYLE-006 negative rejects unknown variants', () => {
    expect(() => buttonRecipe({ variant: 'unknown' as never })).toThrowError(UIFnRecipeError);
  });

  it('keeps Tailwind recipe classes static', () => {
    expect(buttonTailwindClasses({ variant: 'primary', hoverEffect: 'tint' })).toEqual({
      className: 'uifn-button uifn-button--primary uifn-button--md uifn-hover--tint',
      usesCssVars: true,
      tailwindDynamicClassFragments: [],
    });
  });
});
