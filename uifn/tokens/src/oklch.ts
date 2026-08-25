import { UIFnTokenError, type DesignTokenTheme, flattenTokens } from './schema';

export interface OklchColor {
  l: number;
  c: number;
  h: number;
}

export interface OklchRampOptions {
  hue: number;
  chroma?: number;
  lightness?: number[];
}

const UNSIGNED_NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?`;
const SIGNED_NUMBER = String.raw`[+-]?${UNSIGNED_NUMBER}`;
const OKLCH_PATTERN = new RegExp(
  String.raw`^oklch\(\s*(${UNSIGNED_NUMBER})(%)?\s+(${UNSIGNED_NUMBER})\s+(${SIGNED_NUMBER})(?:deg)?\s*\)$`,
  'i',
);
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function parseOklch(input: string): OklchColor {
  const match = input.trim().match(OKLCH_PATTERN);

  if (!match) {
    throw new UIFnTokenError('UIFN_TOKEN_CONTRAST_FAILED', 'Expected an OKLCH color string.', {
      input,
    });
  }

  const l = Number(match[1]) / (match[2] ? 100 : 1);
  const c = Number(match[3]);
  const h = Number(match[4]);
  if (![l, c, h].every(Number.isFinite)) {
    throw new UIFnTokenError('UIFN_TOKEN_CONTRAST_FAILED', 'Expected finite OKLCH components.', {
      input,
    });
  }

  return { l, c, h: normalizeHue(h) };
}

function parseHexColor(input: string): [number, number, number] {
  const match = input.trim().match(HEX_COLOR_PATTERN);
  if (!match) {
    throw new UIFnTokenError('UIFN_TOKEN_CONTRAST_FAILED', 'Expected an OKLCH or hex color string.', {
      input,
    });
  }

  const raw = match[1];
  const hex = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;

  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearSrgbToOklch(r: number, g: number, b: number): OklchColor {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const bAxis = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;
  const hue = normalizeHue((Math.atan2(bAxis, a) * 180) / Math.PI);

  return {
    l: lightness,
    c: Math.sqrt(a ** 2 + bAxis ** 2),
    h: hue,
  };
}

export function parseColorToOklch(input: string): OklchColor {
  if (input.trim().toLowerCase().startsWith('oklch(')) {
    return parseOklch(input);
  }

  const [r, g, b] = parseHexColor(input);
  return linearSrgbToOklch(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

export function formatOklch(color: OklchColor): string {
  return `oklch(${Math.round(clamp(color.l, 0, 1) * 10000) / 100}% ${Math.round(clamp(color.c, 0, 0.4) * 1000) / 1000} ${Math.round(normalizeHue(color.h) * 100) / 100})`;
}

export function createOklchRamp(options: OklchRampOptions): string[] {
  const lightness = options.lightness ?? [0.98, 0.94, 0.88, 0.76, 0.64, 0.52, 0.4, 0.28, 0.2];
  const chroma = options.chroma ?? 0.04;

  return lightness.map((l) =>
    formatOklch({
      l,
      c: chroma,
      h: options.hue,
    })
  );
}

function oklchToLinearSrgb(color: OklchColor): [number, number, number] {
  const a = color.c * Math.cos((color.h * Math.PI) / 180);
  const b = color.c * Math.sin((color.h * Math.PI) / 180);
  const lPrime = color.l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = color.l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = color.l - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => clamp(channel, 0, 1)) as [number, number, number];
}

function relativeLuminance(color: OklchColor): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(parseOklch(foreground));
  const bg = relativeLuminance(parseOklch(background));
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);

  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

export function validateContrastPair(
  foreground: string,
  background: string,
  minimum = 4.5
): { ok: true; contrastRatio: number; minimum: number } {
  const ratio = contrastRatio(foreground, background);

  if (ratio < minimum) {
    throw new UIFnTokenError('UIFN_CONTRAST_BUDGET', 'Token contrast is below the required minimum.', {
      contrastRatio: ratio,
      minimum,
    });
  }

  return {
    ok: true,
    contrastRatio: ratio,
    minimum,
  };
}

export function createCustomSurface(options: {
  hue: number;
  contrast?: 'auto' | number;
  mode?: 'light' | 'dark';
}) {
  const mode = options.mode ?? 'light';
  const solid = formatOklch({
    l: mode === 'light' ? 0.52 : 0.7,
    c: 0.16,
    h: options.hue,
  });
  const contrast = mode === 'light' ? 'oklch(100% 0 0)' : 'oklch(12% 0.01 260)';
  const minimum = options.contrast === 'auto' || options.contrast === undefined ? 4.5 : options.contrast;
  const validation = validateContrastPair(contrast, solid, minimum);

  return {
    tokens: {
      solid,
      subtle: formatOklch({ l: mode === 'light' ? 0.94 : 0.24, c: 0.05, h: options.hue }),
      contrast,
    },
    validation,
  };
}

export function validateThemeContrast(theme: DesignTokenTheme): { ok: true; checkedPairs: number } {
  const flattened = flattenTokens(theme.tokens);
  const byPath = new Map(flattened.map(({ path, token }) => [path.join('.'), token]));
  const pairs: Array<[string, string]> = [
    ['color.text.primary', 'color.surface.canvas'],
    ['color.text.secondary', 'color.surface.canvas'],
    ['color.accent.contrast', 'color.accent.solid'],
    ['color.danger.contrast', 'color.danger.solid'],
    ['color.warning.contrast', 'color.warning.solid'],
    ['color.success.contrast', 'color.success.solid'],
  ];

  flattened.forEach(({ path, token }) => {
    const contrastAgainst = token.$extensions?.uifn?.contrastAgainst;
    if (contrastAgainst) {
      pairs.push([path.join('.'), contrastAgainst]);
    }
  });

  const uniquePairs = Array.from(new Set(pairs.map((pair) => pair.join('|')))).map((pair) =>
    pair.split('|') as [string, string]
  );
  let checkedPairs = 0;

  uniquePairs.forEach(([foregroundPath, backgroundPath]) => {
    const foreground = byPath.get(foregroundPath);
    const background = byPath.get(backgroundPath);
    if (!foreground || !background) {
      return;
    }

    if (foreground.$extensions?.uifn?.decorativeOnly || background.$extensions?.uifn?.decorativeOnly) {
      return;
    }

    validateContrastPair(String(foreground.$value), String(background.$value));
    checkedPairs += 1;
  });

  return {
    ok: true,
    checkedPairs,
  };
}
