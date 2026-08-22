import { describe, expect, it } from 'vitest';
import { validateTokenTheme } from '@uifn/tokens';
import { createBrandTheme } from '../brand';
import { createThemeProvider, FIRST_PARTY_THEMES, listFirstPartyThemes } from '../provider';
import { UIFnThemeError, mountTheme, themeToCSS, type ThemeStyleSheet } from '../mount';

describe('runtime theme mounting', () => {
  it('exposes required first-party themes', () => {
    expect(listFirstPartyThemes()).toEqual([
      'uifn-light',
      'uifn-dark',
      'uifn-high-contrast-light',
      'uifn-high-contrast-dark',
    ]);
    Object.values(FIRST_PARTY_THEMES).forEach((theme) => {
      expect(validateTokenTheme(theme).ok).toBe(true);
      expect((theme.tokens as Record<string, unknown>).color).toMatchObject({
        danger: expect.any(Object),
        warning: expect.any(Object),
        success: expect.any(Object),
      });
      expect(theme.tokens).toMatchObject({
        typography: expect.any(Object),
        space: expect.any(Object),
        control: expect.any(Object),
        border: expect.any(Object),
        elevation: expect.any(Object),
        icon: expect.any(Object),
      });
    });
  });

  it('TV-STYLE-003 creates contrast-checked brand themes from OKLCH and hex inputs', () => {
    const theme = createBrandTheme({
      name: 'acme',
      mode: 'light',
      accent: '#2563eb',
      neutral: 'oklch(70% 0.02 245)',
    });

    expect(validateTokenTheme(theme).ok).toBe(true);
    expect((theme.tokens as Record<string, unknown>).color).toMatchObject({
      accent: {
        solid: { $type: 'color' },
        contrast: {
          $extensions: {
            uifn: {
              contrastAgainst: 'color.accent.solid',
            },
          },
        },
      },
      danger: expect.any(Object),
      warning: expect.any(Object),
      success: expect.any(Object),
    });
  });

  it('TV-STYLE-002 mounts scoped CSS variables', () => {
    const css = themeToCSS('uifn-dark', '[data-uifn-theme="uifn-dark"]');

    expect(css).toContain('[data-uifn-theme="uifn-dark"]{');
    expect(css).toContain('--uifn-color-surface-canvas:oklch(');
    expect(css).toContain('--uifn-color-text-primary:oklch(');
    expect(css).toContain('--uifn-radius-md:6px;');
    expect(css).toContain('--uifn-motion-easing-standard:cubic-bezier');
    expect(css).toContain('--uifn-typography-family-sans:Inter');
    expect(css).toContain('--uifn-space-4:1rem;');
    expect(css).toContain('--uifn-control-size-md:2.5rem;');
    expect(css).toContain('--uifn-border-width-default:1px;');
    expect(css).toContain('--uifn-elevation-shadow-overlay:');
    expect(css).toContain('--uifn-icon-size-md:1rem;');
  });

  it('TV-STYLE-002 supports runtime root mounting and cleanup', () => {
    const vars = new Map<string, string>();
    const attrs = new Map<string, string>();
    const mounted = mountTheme('uifn-light', {
      scope: '[data-uifn-theme="uifn-light"]',
      root: {
        style: {
          setProperty: (name, value) => vars.set(name, value),
          removeProperty: (name) => vars.delete(name),
        },
        setAttribute: (name, value) => attrs.set(name, value),
        removeAttribute: (name) => attrs.delete(name),
      },
    });

    expect(vars.get('--uifn-color-surface-canvas')).toMatch(/^oklch/);
    expect(attrs.get('data-uifn-theme')).toBe('uifn-light');
    mounted.unmount();
    expect(vars.size).toBe(0);
    expect(attrs.has('data-uifn-theme')).toBe(false);
  });

  it('keeps the current theme when a candidate fails validation', () => {
    const provider = createThemeProvider('uifn-light');
    const invalid = structuredClone(FIRST_PARTY_THEMES['uifn-dark']);
    delete (invalid.tokens.color as Record<string, Record<string, unknown>>).danger;

    expect(() => provider.setTheme(invalid)).toThrow();
    expect(provider.theme).toBe(FIRST_PARTY_THEMES['uifn-light']);
    expect(provider.getTheme()).toBe(FIRST_PARTY_THEMES['uifn-light']);
  });

  it('restores pre-existing root variables and theme attributes on cleanup', () => {
    const vars = new Map<string, string>([['--uifn-color-surface-canvas', 'consumer-value']]);
    const attrs = new Map<string, string>([['data-uifn-theme', 'consumer-theme']]);
    const mounted = mountTheme('uifn-light', {
      root: {
        style: {
          setProperty: (name, value) => vars.set(name, value),
          getPropertyValue: (name) => vars.get(name) ?? '',
          removeProperty: (name) => vars.delete(name),
        },
        setAttribute: (name, value) => attrs.set(name, value),
        getAttribute: (name) => attrs.get(name) ?? null,
        hasAttribute: (name) => attrs.has(name),
        removeAttribute: (name) => attrs.delete(name),
      },
    });

    expect(attrs.get('data-uifn-theme')).toBe('uifn-light');
    expect(vars.get('--uifn-color-surface-canvas')).not.toBe('consumer-value');
    mounted.unmount();
    expect(attrs.get('data-uifn-theme')).toBe('consumer-theme');
    expect(vars.get('--uifn-color-surface-canvas')).toBe('consumer-value');
  });

  it('TV-STYLE-002 supports shadow-root adopted stylesheet mounting and cleanup', () => {
    const existingSheet: ThemeStyleSheet = {
      cssText: '.consumer{}',
      replaceSync(css) {
        this.cssText = css;
      },
    };
    const shadowRoot = {
      adoptedStyleSheets: [existingSheet],
    };

    const mounted = mountTheme('uifn-high-contrast-dark', {
      scope: ':host',
      shadowRoot,
    });

    expect(shadowRoot.adoptedStyleSheets).toHaveLength(2);
    expect(shadowRoot.adoptedStyleSheets[0]).toBe(existingSheet);
    expect(shadowRoot.adoptedStyleSheets[1]?.cssText).toContain(':host{');
    expect(shadowRoot.adoptedStyleSheets[1]?.cssText).toContain('--uifn-color-accent-contrast:oklch(');

    mounted.unmount();

    expect(shadowRoot.adoptedStyleSheets).toEqual([existingSheet]);
  });

  it('allows a scoped child combinator', () => {
    expect(themeToCSS('uifn-dark', '.shell > .content')).toContain('.shell > .content{');
    expect(themeToCSS('uifn-dark', '[data-value="body>body"]')).toContain('[data-value="body>body"]{');
    expect(themeToCSS('uifn-dark', '.somebody>body')).toContain('.somebody>body{');
  });

  it('rejects token values that can escape a CSS custom-property declaration', () => {
    const unsafe = structuredClone(FIRST_PARTY_THEMES['uifn-dark']);
    const control = unsafe.tokens.control as Record<string, Record<string, { $value: string }>>;
    control.size!.md!.$value = '1px;}body{display:none';

    expect(() => themeToCSS(unsafe, '.shell')).toThrowError(expect.objectContaining({
      code: 'UIFN_THEME_TOKEN_VALUE_INVALID',
    }));
  });

  it('TV-STYLE-002 negative rejects unsafe global selectors', () => {
    expect(() => themeToCSS('uifn-dark', 'html body *')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', 'html > body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', 'html>body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', 'body > body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', '\\68 tml>body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', ':root, body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', ':root { color: red; } body')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', '@media print')).toThrowError(UIFnThemeError);
    expect(() => themeToCSS('uifn-dark', '</style><script>alert(1)</script>')).toThrowError(UIFnThemeError);
  });
});
