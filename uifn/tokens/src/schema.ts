export type TokenType =
  | 'color'
  | 'dimension'
  | 'duration'
  | 'number'
  | 'shadow'
  | 'fontFamily'
  | 'cubicBezier';

export interface DesignToken {
  $type: TokenType;
  $value: string | number;
  $description?: string;
  $extensions?: {
    uifn?: {
      decorativeOnly?: boolean;
      contrastAgainst?: string;
      minimumContrast?: number;
      fallbackValue?: string | number;
      reducedMotionValue?: string | number;
    };
  };
}

export type TokenTree = {
  [key: string]: TokenTree | DesignToken;
};

export interface DesignTokenTheme {
  $schema?: string;
  schemaVersion?: number;
  name: string;
  mode?: 'light' | 'dark' | 'high-contrast-light' | 'high-contrast-dark';
  tokens: TokenTree;
}

export interface TokenValidationResult {
  ok: true;
  publicNames: string[];
  resolvedReferences: number;
  motionAlternatives: number;
}

export type TokenErrorCode =
  | 'UIFN_TOKEN_PUBLIC_NAME_INVALID'
  | 'UIFN_TOKEN_GROUP_UNKNOWN'
  | 'UIFN_TOKEN_REQUIRED_GROUP_MISSING'
  | 'UIFN_TOKEN_TYPE_INVALID'
  | 'UIFN_TOKEN_CONTRAST_FAILED'
  | 'UIFN_TOKEN_REFERENCE_MISSING'
  | 'UIFN_TOKEN_REFERENCE_CYCLE'
  | 'UIFN_TOKEN_REFERENCE_FALLBACK_MISSING'
  | 'UIFN_REDUCED_MOTION_VIOLATION'
  | 'UIFN_CONTRAST_BUDGET'
  | 'UIFN_SEMANTIC_COLOR_HARDCODED';

export class UIFnTokenError extends Error {
  readonly name = 'UIFnTokenError';
  readonly code: TokenErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: TokenErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    this.details = details;
  }
}

export const PUBLIC_TOKEN_GROUPS = {
  color: {
    surface: ['canvas', 'raised', 'sunken', 'overlay', 'depth-0', 'depth-1', 'depth-2', 'depth-3', 'depth-4'],
    text: ['primary', 'secondary', 'muted', 'disabled'],
    border: ['subtle', 'default', 'strong'],
    accent: ['solid', 'subtle', 'contrast'],
    danger: ['solid', 'subtle', 'contrast'],
    warning: ['solid', 'subtle', 'contrast'],
    success: ['solid', 'subtle', 'contrast'],
    custom: ['solid', 'subtle', 'contrast'],
  },
  radius: {
    value: ['sm', 'md', 'lg', 'xl', 'full'],
  },
  typography: {
    family: ['sans', 'mono'],
    size: ['xs', 'sm', 'md', 'lg', 'xl'],
    lineHeight: ['tight', 'normal', 'relaxed'],
    weight: ['regular', 'medium', 'semibold', 'bold'],
  },
  space: {
    value: ['1', '2', '3', '4', '5', '6', '8', '12'],
  },
  control: {
    size: ['sm', 'md', 'lg'],
    gap: ['sm', 'md', 'lg'],
  },
  border: {
    width: ['hairline', 'default', 'strong'],
  },
  elevation: {
    shadow: ['sm', 'md', 'lg', 'overlay'],
  },
  icon: {
    size: ['sm', 'md', 'lg'],
    stroke: ['regular', 'strong'],
  },
  density: {
    value: ['compact', 'comfortable', 'spacious'],
  },
  motion: {
    duration: ['fast', 'normal', 'slow'],
    easing: ['standard', 'entrance', 'exit'],
  },
} as const;

export const CRYPTIC_PUBLIC_TOKEN_NAMES = new Set(['bgs1', 'fgs1', 'aps1', 'ccs1']);

export const REQUIRED_PUBLIC_TOKEN_PATHS = [
  ...PUBLIC_TOKEN_GROUPS.color.surface.map((name) => ['color', 'surface', name]),
  ...PUBLIC_TOKEN_GROUPS.color.text.map((name) => ['color', 'text', name]),
  ...PUBLIC_TOKEN_GROUPS.color.border.map((name) => ['color', 'border', name]),
  ...PUBLIC_TOKEN_GROUPS.color.accent.map((name) => ['color', 'accent', name]),
  ...PUBLIC_TOKEN_GROUPS.color.danger.map((name) => ['color', 'danger', name]),
  ...PUBLIC_TOKEN_GROUPS.color.warning.map((name) => ['color', 'warning', name]),
  ...PUBLIC_TOKEN_GROUPS.color.success.map((name) => ['color', 'success', name]),
  ...PUBLIC_TOKEN_GROUPS.radius.value.map((name) => ['radius', name]),
  ...PUBLIC_TOKEN_GROUPS.density.value.map((name) => ['density', name]),
  ...PUBLIC_TOKEN_GROUPS.motion.duration.map((name) => ['motion', 'duration', name]),
  ...PUBLIC_TOKEN_GROUPS.motion.easing.map((name) => ['motion', 'easing', name]),
] as const;

export const PUBLIC_TOKEN_TYPES = new Set<TokenType>([
  'color',
  'dimension',
  'duration',
  'number',
  'shadow',
  'fontFamily',
  'cubicBezier',
]);

export function isDesignToken(value: unknown): value is DesignToken {
  return Boolean(
    value &&
      typeof value === 'object' &&
      '$type' in value &&
      '$value' in value
  );
}

export function flattenTokens(
  tokens: TokenTree,
  prefix: string[] = []
): Array<{ path: string[]; token: DesignToken }> {
  return Object.entries(tokens).flatMap(([key, value]) => {
    const nextPath = [...prefix, key];
    if (isDesignToken(value)) {
      return [{ path: nextPath, token: value }];
    }

    return flattenTokens(value as TokenTree, nextPath);
  });
}

export function publicTokenName(path: string[]): string {
  if (path[0] === 'color') {
    return path.slice(1).join('.');
  }

  return path.join('.');
}

export function cssVariableName(path: string[]): `--uifn-${string}` {
  return `--uifn-${path.join('-')}`;
}

export function tokenPathFromName(name: string): string[] {
  return name.split('.').filter(Boolean);
}
