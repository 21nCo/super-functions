import { describe, expect, it } from 'vitest';
import {
  UIFnTailwindError,
  assertSafeTailwindClassFragments,
  buttonTailwindOutput,
  createTailwindPreset,
} from '../index';

describe('theme-tailwind integration', () => {
  it('TV-STYLE-005 emits static classes and CSS-variable-backed colors', () => {
    expect(buttonTailwindOutput()).toEqual({
      className: 'uifn-button uifn-button--primary uifn-button--md uifn-hover--tint',
      usesCssVars: true,
      tailwindDynamicClassFragments: [],
    });

    const preset = createTailwindPreset();
    expect(preset.theme.extend.colors['uifn-surface-canvas']).toBe('var(--uifn-color-surface-canvas)');
    expect(preset.theme.extend.colors['uifn-danger-solid']).toBe('var(--uifn-color-danger-solid)');
    expect(preset.theme.extend.colors['uifn-warning-contrast']).toBe('var(--uifn-color-warning-contrast)');
    expect(preset.theme.extend.colors['uifn-success-subtle']).toBe('var(--uifn-color-success-subtle)');
    expect(preset.safelist).toContain('uifn-hover--stripe');
    expect(preset.safelist).toContain('uifn-button--danger');
    expect(preset.plugins[0]?.utilities['.uifn-surface']).toEqual({
      color: 'var(--uifn-color-text-primary)',
      backgroundColor: 'var(--uifn-surface, var(--uifn-color-surface-canvas))',
    });
    expect(preset.plugins[0]?.utilities['.uifn-hover--stripe']).toEqual({
      '--uifn-hover-effect': 'stripe',
    });
    const registered: Record<string, Record<string, string>>[] = [];
    preset.plugins[0]?.handler({ addUtilities: (utilities) => registered.push(utilities) });
    expect(registered).toEqual([preset.plugins[0]?.utilities]);
    expect(preset.plugins[0]?.config).toEqual({});
  });

  it('TV-STYLE-005 negative rejects dynamic class fragments', () => {
    expect(() => assertSafeTailwindClassFragments(['hover:${computedClass}'])).toThrowError(
      UIFnTailwindError
    );
  });
});
