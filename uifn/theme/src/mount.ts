import { cssVariableName, flattenTokens, validateTokenTheme, type DesignTokenTheme } from '@uifn/tokens';
import { getTheme, type FirstPartyThemeName } from './provider';

export type ThemeErrorCode = 'UIFN_THEME_SCOPE_INVALID' | 'UIFN_THEME_TOKEN_VALUE_INVALID';

export class UIFnThemeError extends Error {
  readonly name = 'UIFnThemeError';
  readonly code: ThemeErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ThemeErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.code = code;
    this.details = details;
  }
}

export interface StyleTarget {
  setProperty: (name: string, value: string) => void;
  getPropertyValue?: (name: string) => string;
  removeProperty?: (name: string) => void;
}

export interface ThemeMountRoot {
  style: StyleTarget;
  setAttribute?: (name: string, value: string) => void;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
  removeAttribute?: (name: string) => void;
}

export interface ThemeStyleSheet {
  replaceSync: (css: string) => void;
  cssText?: string;
}

export interface AdoptedStyleRoot {
  adoptedStyleSheets: ThemeStyleSheet[];
}

export interface MountThemeOptions {
  root?: ThemeMountRoot;
  shadowRoot?: AdoptedStyleRoot;
  scope?: string;
}

export interface MountedTheme {
  theme: DesignTokenTheme;
  vars: Record<`--uifn-${string}`, string>;
  css: string;
  unmount: () => void;
}

const GLOBAL_SCOPE_PATTERN = /(?:^|[\s>+~,(])(?:html|body)(?:\s+|\s*>\s*)body(?=$|[\s>+~.#:[(])/i;
const UNSAFE_SCOPE_PATTERN = /\*|[\\<{},;@]|\/\*|\*\/|[\u0000-\u001f\u007f]/;
const TOKEN_REFERENCE_PATTERN = /^\{[A-Za-z0-9.-]+\}$/;
const UNSAFE_TOKEN_VALUE_PATTERN = /[;{}<]|\/\*|\*\/|[\u0000-\u001f\u007f]/;

export function assertSafeThemeScope(scope: string): void {
  if (!scope.trim() || GLOBAL_SCOPE_PATTERN.test(scope) || UNSAFE_SCOPE_PATTERN.test(scope)) {
    throw new UIFnThemeError('UIFN_THEME_SCOPE_INVALID', 'Theme scope selector is unsafe.', {
      scope,
    });
  }
}

function assertSafeThemeTokenValue(path: readonly string[], value: string | number): void {
  const serialized = String(value);
  if (
    (typeof value === 'number' && !Number.isFinite(value)) ||
    (UNSAFE_TOKEN_VALUE_PATTERN.test(serialized) && !TOKEN_REFERENCE_PATTERN.test(serialized))
  ) {
    throw new UIFnThemeError(
      'UIFN_THEME_TOKEN_VALUE_INVALID',
      'Theme token value is unsafe for CSS serialization.',
      { path: path.join('.') }
    );
  }
}

export function themeToVars(theme: DesignTokenTheme): Record<`--uifn-${string}`, string> {
  validateTokenTheme(theme);
  return Object.fromEntries(
    flattenTokens(theme.tokens).map(({ path, token }) => {
      assertSafeThemeTokenValue(path, token.$value);
      return [cssVariableName(path), String(token.$value)];
    })
  ) as Record<`--uifn-${string}`, string>;
}

export function themeToCSS(theme: FirstPartyThemeName | DesignTokenTheme, scope = ':root'): string {
  assertSafeThemeScope(scope);
  const resolvedTheme = getTheme(theme);
  const declarations = Object.entries(themeToVars(resolvedTheme))
    .map(([name, value]) => `${name}:${value};`)
    .join('');

  return `${scope}{${declarations}}`;
}

export function createThemeStyleSheet(css: string): ThemeStyleSheet {
  const SheetConstructor = (globalThis as unknown as {
    CSSStyleSheet?: new () => ThemeStyleSheet;
  }).CSSStyleSheet;

  if (SheetConstructor) {
    const sheet = new SheetConstructor();
    sheet.replaceSync(css);
    return sheet;
  }

  return {
    cssText: css,
    replaceSync(nextCss: string) {
      this.cssText = nextCss;
    },
  };
}

export function mountTheme(
  theme: FirstPartyThemeName | DesignTokenTheme,
  options: MountThemeOptions = {}
): MountedTheme {
  const resolvedTheme = getTheme(theme);
  const scope = options.scope ?? ':root';
  const vars = themeToVars(resolvedTheme);
  const css = themeToCSS(resolvedTheme, scope);
  const previousSheets = options.shadowRoot?.adoptedStyleSheets;
  const mountedSheet = options.shadowRoot ? createThemeStyleSheet(css) : undefined;
  const previousThemeName = options.root?.getAttribute?.('data-uifn-theme') ?? null;
  const hadThemeName = options.root?.hasAttribute?.('data-uifn-theme') ?? previousThemeName !== null;
  const previousVars = new Map(Object.keys(vars).map((name) => [
    name,
    options.root?.style.getPropertyValue?.(name) ?? null,
  ]));

  assertSafeThemeScope(scope);
  options.root?.setAttribute?.('data-uifn-theme', resolvedTheme.name);
  Object.entries(vars).forEach(([name, value]) => options.root?.style.setProperty(name, value));
  if (mountedSheet && previousSheets) {
    options.shadowRoot!.adoptedStyleSheets = [...previousSheets, mountedSheet];
  }

  return {
    theme: resolvedTheme,
    vars,
    css,
    unmount() {
      for (const [name, previousValue] of previousVars) {
        if (previousValue) options.root?.style.setProperty(name, previousValue);
        else options.root?.style.removeProperty?.(name);
      }
      if (hadThemeName) options.root?.setAttribute?.('data-uifn-theme', previousThemeName ?? '');
      else options.root?.removeAttribute?.('data-uifn-theme');
      if (mountedSheet && previousSheets) {
        options.shadowRoot!.adoptedStyleSheets = options.shadowRoot!.adoptedStyleSheets.filter(
          (sheet) => sheet !== mountedSheet
        );
      }
    },
  };
}
