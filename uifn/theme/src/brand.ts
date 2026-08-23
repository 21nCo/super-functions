import {
  contrastRatio,
  formatOklch,
  parseColorToOklch,
  validateContrastPair,
  type DesignToken,
  type DesignTokenTheme,
  type OklchColor,
} from '@uifn/tokens';
import { createFoundationalTokens } from './foundations';

export interface CreateBrandThemeOptions {
  name: string;
  mode: 'light' | 'dark';
  accent: string;
  neutral?: string;
  danger?: string;
  warning?: string;
  success?: string;
  minimumContrast?: number;
}

type ToneName = 'accent' | 'danger' | 'warning' | 'success';

function colorToken(value: string, contrastAgainst?: string): DesignToken {
  return {
    $type: 'color',
    $value: value,
    ...(contrastAgainst
      ? {
          $extensions: {
            uifn: {
              contrastAgainst,
            },
          },
        }
      : {}),
  };
}

function dimensionToken(value: string): DesignToken {
  return { $type: 'dimension', $value: value };
}

function durationToken(value: string): DesignToken {
  return { $type: 'duration', $value: value, $extensions: { uifn: { reducedMotionValue: '0ms' } } };
}

function numberToken(value: number): DesignToken {
  return { $type: 'number', $value: value };
}

function shift(color: OklchColor, next: Partial<OklchColor>): string {
  return formatOklch({
    l: next.l ?? color.l,
    c: next.c ?? color.c,
    h: next.h ?? color.h,
  });
}

function chooseContrast(background: string, minimum: number): string {
  const light = 'oklch(100% 0 0)';
  const dark = 'oklch(12% 0.01 250)';
  const lightContrast = contrastRatio(light, background);
  const darkContrast = contrastRatio(dark, background);
  const foreground = lightContrast >= darkContrast ? light : dark;

  validateContrastPair(foreground, background, minimum);
  return foreground;
}

function createToneTokens(
  tone: ToneName,
  input: string,
  mode: 'light' | 'dark',
  minimumContrast: number
): Record<'solid' | 'subtle' | 'contrast', DesignToken> {
  const color = parseColorToOklch(input);
  const solid = shift(color, {
    l: mode === 'light'
      ? Math.min(color.l, tone === 'warning' ? 0.64 : 0.56)
      : Math.max(color.l, tone === 'warning' ? 0.76 : 0.68),
    c: Math.max(color.c, tone === 'warning' ? 0.14 : 0.15),
  });
  const subtle = shift(color, {
    l: mode === 'light' ? 0.93 : 0.24,
    c: tone === 'warning' ? 0.06 : 0.05,
  });
  const contrast = chooseContrast(solid, minimumContrast);

  return {
    solid: colorToken(solid),
    subtle: colorToken(subtle),
    contrast: colorToken(contrast, `color.${tone}.solid`),
  };
}

function createSurfaceTokens(neutral: OklchColor, mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      canvas: colorToken(shift(neutral, { l: 0.15, c: Math.min(neutral.c, 0.02) })),
      raised: colorToken(shift(neutral, { l: 0.2, c: Math.min(neutral.c, 0.022) })),
      sunken: colorToken(shift(neutral, { l: 0.11, c: Math.min(neutral.c, 0.018) })),
      overlay: colorToken(shift(neutral, { l: 0.24, c: Math.min(neutral.c, 0.024) })),
      'depth-0': colorToken(shift(neutral, { l: 0.15, c: Math.min(neutral.c, 0.02) })),
      'depth-1': colorToken(shift(neutral, { l: 0.18, c: Math.min(neutral.c, 0.022) })),
      'depth-2': colorToken(shift(neutral, { l: 0.21, c: Math.min(neutral.c, 0.024) })),
      'depth-3': colorToken(shift(neutral, { l: 0.24, c: Math.min(neutral.c, 0.026) })),
      'depth-4': colorToken(shift(neutral, { l: 0.27, c: Math.min(neutral.c, 0.028) })),
    };
  }

  return {
    canvas: colorToken(shift(neutral, { l: 0.98, c: Math.min(neutral.c, 0.014) })),
    raised: colorToken(shift(neutral, { l: 1, c: Math.min(neutral.c, 0.008) })),
    sunken: colorToken(shift(neutral, { l: 0.94, c: Math.min(neutral.c, 0.016) })),
    overlay: colorToken(shift(neutral, { l: 0.99, c: Math.min(neutral.c, 0.01) })),
    'depth-0': colorToken(shift(neutral, { l: 0.98, c: Math.min(neutral.c, 0.014) })),
    'depth-1': colorToken(shift(neutral, { l: 0.96, c: Math.min(neutral.c, 0.016) })),
    'depth-2': colorToken(shift(neutral, { l: 0.94, c: Math.min(neutral.c, 0.018) })),
    'depth-3': colorToken(shift(neutral, { l: 0.92, c: Math.min(neutral.c, 0.02) })),
    'depth-4': colorToken(shift(neutral, { l: 0.9, c: Math.min(neutral.c, 0.022) })),
  };
}

function createTextTokens(neutral: OklchColor, mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      primary: colorToken(shift(neutral, { l: 0.95, c: Math.min(neutral.c, 0.012) }), 'color.surface.canvas'),
      secondary: colorToken(shift(neutral, { l: 0.82, c: Math.min(neutral.c, 0.014) }), 'color.surface.canvas'),
      muted: colorToken(shift(neutral, { l: 0.7, c: Math.min(neutral.c, 0.014) })),
      disabled: colorToken(shift(neutral, { l: 0.54, c: Math.min(neutral.c, 0.012) })),
    };
  }

  return {
    primary: colorToken(shift(neutral, { l: 0.2, c: Math.min(neutral.c, 0.024) }), 'color.surface.canvas'),
    secondary: colorToken(shift(neutral, { l: 0.35, c: Math.min(neutral.c, 0.024) }), 'color.surface.canvas'),
    muted: colorToken(shift(neutral, { l: 0.5, c: Math.min(neutral.c, 0.018) })),
    disabled: colorToken(shift(neutral, { l: 0.55, c: Math.min(neutral.c, 0.012) })),
  };
}

function createBorderTokens(neutral: OklchColor, mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      subtle: colorToken(shift(neutral, { l: 0.28, c: Math.min(neutral.c, 0.018) })),
      default: colorToken(shift(neutral, { l: 0.38, c: Math.min(neutral.c, 0.02) })),
      strong: colorToken(shift(neutral, { l: 0.54, c: Math.min(neutral.c, 0.022) })),
    };
  }

  return {
    subtle: colorToken(shift(neutral, { l: 0.88, c: Math.min(neutral.c, 0.012) })),
    default: colorToken(shift(neutral, { l: 0.78, c: Math.min(neutral.c, 0.014) })),
    strong: colorToken(shift(neutral, { l: 0.58, c: Math.min(neutral.c, 0.016) })),
  };
}

export function createBrandTheme(options: CreateBrandThemeOptions): DesignTokenTheme {
  const minimumContrast = options.minimumContrast ?? 4.5;
  const neutral = parseColorToOklch(options.neutral ?? 'oklch(70% 0.02 250)');
  const theme: DesignTokenTheme = {
    $schema: 'https://uifn.dev/schemas/tokens.schema.json',
    schemaVersion: 1,
    name: options.name,
    mode: options.mode,
    tokens: {
      ...createFoundationalTokens(),
      color: {
        surface: createSurfaceTokens(neutral, options.mode),
        text: createTextTokens(neutral, options.mode),
        border: createBorderTokens(neutral, options.mode),
        accent: createToneTokens('accent', options.accent, options.mode, minimumContrast),
        danger: createToneTokens('danger', options.danger ?? 'oklch(56% 0.19 25)', options.mode, minimumContrast),
        warning: createToneTokens('warning', options.warning ?? 'oklch(66% 0.16 80)', options.mode, minimumContrast),
        success: createToneTokens('success', options.success ?? 'oklch(54% 0.14 145)', options.mode, minimumContrast),
      },
      radius: {
        sm: dimensionToken('4px'),
        md: dimensionToken('6px'),
        lg: dimensionToken('8px'),
        xl: dimensionToken('12px'),
        full: dimensionToken('9999px'),
      },
      density: {
        compact: numberToken(0.875),
        comfortable: numberToken(1),
        spacious: numberToken(1.125),
      },
      motion: {
        duration: {
          fast: durationToken('120ms'),
          normal: durationToken('180ms'),
          slow: durationToken('260ms'),
        },
        easing: {
          standard: { $type: 'cubicBezier', $value: 'cubic-bezier(0.2, 0, 0, 1)' } as DesignToken,
          entrance: { $type: 'cubicBezier', $value: 'cubic-bezier(0, 0, 0.2, 1)' } as DesignToken,
          exit: { $type: 'cubicBezier', $value: 'cubic-bezier(0.4, 0, 1, 1)' } as DesignToken,
        },
      },
    },
  };

  return theme;
}
