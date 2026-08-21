import { describe, expect, it } from 'vitest';
import { createCustomSurface, contrastRatio, parseColorToOklch, parseOklch, validateContrastPair } from '../oklch';
import { UIFnTokenError, type DesignTokenTheme } from '../schema';
import { assertSemanticStylesUseTokens, validateTokenTheme } from '../validate';

function completeTheme(): DesignTokenTheme {
  return {
    name: 'uifn-light',
    tokens: {
      color: {
        surface: {
          canvas: { $type: 'color', $value: 'oklch(98% 0.01 250)' },
          raised: { $type: 'color', $value: 'oklch(100% 0.005 250)' },
          sunken: { $type: 'color', $value: 'oklch(94% 0.012 250)' },
          overlay: { $type: 'color', $value: 'oklch(99% 0.006 250)' },
          'depth-0': { $type: 'color', $value: 'oklch(98% 0.01 250)' },
          'depth-1': { $type: 'color', $value: 'oklch(96% 0.012 250)' },
          'depth-2': { $type: 'color', $value: 'oklch(94% 0.014 250)' },
          'depth-3': { $type: 'color', $value: 'oklch(92% 0.016 250)' },
          'depth-4': { $type: 'color', $value: 'oklch(90% 0.018 250)' },
        },
        text: {
          primary: { $type: 'color', $value: 'oklch(20% 0.02 250)' },
          secondary: { $type: 'color', $value: 'oklch(35% 0.02 250)' },
          muted: { $type: 'color', $value: 'oklch(50% 0.015 250)' },
          disabled: { $type: 'color', $value: 'oklch(64% 0.01 250)' },
        },
        border: {
          subtle: { $type: 'color', $value: 'oklch(88% 0.01 250)' },
          default: { $type: 'color', $value: 'oklch(78% 0.012 250)' },
          strong: { $type: 'color', $value: 'oklch(58% 0.014 250)' },
        },
        accent: {
          solid: { $type: 'color', $value: 'oklch(55% 0.18 250)' },
          subtle: { $type: 'color', $value: 'oklch(92% 0.05 250)' },
          contrast: { $type: 'color', $value: 'oklch(100% 0 0)' },
        },
        danger: {
          solid: { $type: 'color', $value: 'oklch(50% 0.19 25)' },
          subtle: { $type: 'color', $value: 'oklch(94% 0.04 25)' },
          contrast: { $type: 'color', $value: 'oklch(100% 0 0)' },
        },
        warning: {
          solid: { $type: 'color', $value: 'oklch(64% 0.16 80)' },
          subtle: { $type: 'color', $value: 'oklch(94% 0.05 80)' },
          contrast: { $type: 'color', $value: 'oklch(18% 0.02 80)' },
        },
        success: {
          solid: { $type: 'color', $value: 'oklch(48% 0.14 145)' },
          subtle: { $type: 'color', $value: 'oklch(93% 0.04 145)' },
          contrast: { $type: 'color', $value: 'oklch(100% 0 0)' },
        },
      },
      radius: {
        sm: { $type: 'dimension', $value: '4px' },
        md: { $type: 'dimension', $value: '6px' },
        lg: { $type: 'dimension', $value: '8px' },
        xl: { $type: 'dimension', $value: '12px' },
        full: { $type: 'dimension', $value: '9999px' },
      },
      density: {
        compact: { $type: 'number', $value: 0.875 },
        comfortable: { $type: 'number', $value: 1 },
        spacious: { $type: 'number', $value: 1.125 },
      },
      motion: {
        duration: {
          fast: { $type: 'duration', $value: '120ms', $extensions: { uifn: { reducedMotionValue: '0ms' } } },
          normal: { $type: 'duration', $value: '180ms', $extensions: { uifn: { reducedMotionValue: '0ms' } } },
          slow: { $type: 'duration', $value: '260ms', $extensions: { uifn: { reducedMotionValue: '0ms' } } },
        },
        easing: {
          standard: { $type: 'cubicBezier', $value: 'cubic-bezier(0.2, 0, 0, 1)' },
          entrance: { $type: 'cubicBezier', $value: 'cubic-bezier(0, 0, 0.2, 1)' },
          exit: { $type: 'cubicBezier', $value: 'cubic-bezier(0.4, 0, 1, 1)' },
        },
      },
    },
  };
}

function cloneTheme(theme: DesignTokenTheme): DesignTokenTheme {
  return JSON.parse(JSON.stringify(theme)) as DesignTokenTheme;
}

describe('semantic token validation', () => {
  it('TV-STYLE-001 validates semantic public token names', () => {
    const theme = completeTheme();
    const result = validateTokenTheme(theme);

    expect(result.ok).toBe(true);
    expect(result.publicNames).toContain('surface.canvas');
    expect(result.publicNames).toContain('danger.contrast');
    expect(result.publicNames).toContain('radius.md');
    expect(result.publicNames).toContain('motion.easing.standard');
    expect(result.motionAlternatives).toBe(3);
  });

  it('TV-STYLE-001 negative rejects cryptic public aliases', () => {
    const theme = cloneTheme(completeTheme());
    (theme.tokens.color as Record<string, Record<string, unknown>>).surface.bgs1 = {
      $type: 'color',
      $value: 'oklch(98% 0.01 250)',
    };

    expect(() => validateTokenTheme(theme)).toThrowError(UIFnTokenError);
    try {
      validateTokenTheme(theme);
    } catch (error) {
      expect((error as UIFnTokenError).code).toBe('UIFN_TOKEN_PUBLIC_NAME_INVALID');
    }
  });

  it('TV-STYLE-001 negative rejects missing required semantic tokens', () => {
    const theme = cloneTheme(completeTheme());
    delete (theme.tokens.color as Record<string, Record<string, unknown>>).danger.contrast;

    expect(() => validateTokenTheme(theme)).toThrowError(UIFnTokenError);
    try {
      validateTokenTheme(theme);
    } catch (error) {
      expect((error as UIFnTokenError).code).toBe('UIFN_TOKEN_REQUIRED_GROUP_MISSING');
      expect((error as UIFnTokenError).details?.path).toBe('color.danger.contrast');
    }
  });

  it('TV-STYLE-001 negative rejects unknown non-color token paths', () => {
    const theme = cloneTheme(completeTheme());
    (theme.tokens.radius as Record<string, unknown>).pillish = {
      $type: 'dimension',
      $value: '999px',
    };

    expect(() => validateTokenTheme(theme)).toThrowError(UIFnTokenError);
    try {
      validateTokenTheme(theme);
    } catch (error) {
      expect((error as UIFnTokenError).code).toBe('UIFN_TOKEN_PUBLIC_NAME_INVALID');
    }
  });

  it('TV-STYLE-001 negative rejects token types that do not match semantic paths', () => {
    const theme = cloneTheme(completeTheme());
    (theme.tokens.motion as Record<string, Record<string, Record<string, unknown>>>).easing.standard = {
      $type: 'number',
      $value: 'cubic-bezier(0.2, 0, 0, 1)',
    };

    expect(() => validateTokenTheme(theme)).toThrowError(UIFnTokenError);
    try {
      validateTokenTheme(theme);
    } catch (error) {
      expect((error as UIFnTokenError).code).toBe('UIFN_TOKEN_TYPE_INVALID');
    }
  });

  it('TV-STYLE-003 validates OKLCH contrast for custom hue output', () => {
    const surface = createCustomSurface({ hue: 260, contrast: 'auto' });

    expect(surface.validation.ok).toBe(true);
    expect(surface.validation.contrastRatio).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(surface.tokens.contrast, surface.tokens.solid)).toBeGreaterThanOrEqual(4.5);
  });

  it('TV-STYLE-003 converts supported hex color input to OKLCH', () => {
    const color = parseColorToOklch('#2563eb');

    expect(color.l).toBeGreaterThan(0);
    expect(color.c).toBeGreaterThan(0);
    expect(color.h).toBeGreaterThanOrEqual(0);
    expect(color.h).toBeLessThan(360);
  });

  it('TV-STYLE-003 preserves unitless OKLCH lightness', () => {
    expect(parseOklch('oklch(0.5 0.1 240)')).toMatchObject({ l: 0.5, c: 0.1, h: 240 });
    expect(parseOklch('oklch(50% 0.1 240)')).toMatchObject({ l: 0.5, c: 0.1, h: 240 });
  });

  it('TV-STYLE-003 negative rejects low contrast pairs', () => {
    expect(() => validateContrastPair('oklch(50% 0.01 250)', 'oklch(52% 0.01 250)')).toThrowError(
      UIFnTokenError
    );
  });

  it('TV-STYLE-001 resolves typed references with explicit fallbacks', () => {
    const theme = cloneTheme(completeTheme());
    (theme.tokens.color as Record<string, Record<string, Record<string, unknown>>>).surface.raised = {
      $type: 'color',
      $value: '{color.surface.canvas}',
      $extensions: { uifn: { fallbackValue: 'oklch(98% 0.01 250)' } },
    };
    expect(validateTokenTheme(theme).resolvedReferences).toBe(1);
  });

  it('TV-STYLE-001-N rejects missing references, fallbacks, cycles, motion alternatives, and semantic color literals', () => {
    const missing = cloneTheme(completeTheme());
    (missing.tokens.color as Record<string, Record<string, Record<string, unknown>>>).surface.raised = {
      $type: 'color', $value: '{color.surface.absent}', $extensions: { uifn: { fallbackValue: '#fff' } },
    };
    expect(() => validateTokenTheme(missing)).toThrowError(expect.objectContaining({ code: 'UIFN_TOKEN_REFERENCE_MISSING' }));

    const fallback = cloneTheme(completeTheme());
    (fallback.tokens.color as Record<string, Record<string, Record<string, unknown>>>).surface.raised = { $type: 'color', $value: '{color.surface.canvas}' };
    expect(() => validateTokenTheme(fallback)).toThrowError(expect.objectContaining({ code: 'UIFN_TOKEN_REFERENCE_FALLBACK_MISSING' }));

    const cycle = cloneTheme(completeTheme());
    const cycleSurface = (cycle.tokens.color as Record<string, Record<string, Record<string, unknown>>>).surface;
    cycleSurface.raised = { $type: 'color', $value: '{color.surface.sunken}', $extensions: { uifn: { fallbackValue: '#fff' } } };
    cycleSurface.sunken = { $type: 'color', $value: '{color.surface.raised}', $extensions: { uifn: { fallbackValue: '#fff' } } };
    expect(() => validateTokenTheme(cycle)).toThrowError(expect.objectContaining({ code: 'UIFN_TOKEN_REFERENCE_CYCLE' }));

    const motion = cloneTheme(completeTheme());
    delete (motion.tokens.motion as Record<string, Record<string, Record<string, unknown>>>).duration.fast.$extensions;
    expect(() => validateTokenTheme(motion)).toThrowError(expect.objectContaining({ code: 'UIFN_REDUCED_MOTION_VIOLATION' }));

    expect(() => assertSemanticStylesUseTokens({ color: '#fff' })).toThrowError(expect.objectContaining({ code: 'UIFN_SEMANTIC_COLOR_HARDCODED' }));
    expect(() => assertSemanticStylesUseTokens({ color: 'var(--uifn-color-text-primary)', outlineColor: 'Highlight' })).not.toThrow();
  });

  it('emits the exact contrast budget code', () => {
    try { validateContrastPair('oklch(50% 0.01 250)', 'oklch(52% 0.01 250)'); }
    catch (error) { expect((error as UIFnTokenError).code).toBe('UIFN_CONTRAST_BUDGET'); }
  });
});
