import lightTheme from './themes/uifn-light.json';
import darkTheme from './themes/uifn-dark.json';
import highContrastLightTheme from './themes/uifn-high-contrast-light.json';
import highContrastDarkTheme from './themes/uifn-high-contrast-dark.json';
import { validateTokenTheme, type DesignTokenTheme } from '@uifn/tokens';
import { createFoundationalTokens } from './foundations';

export type FirstPartyThemeName =
  | 'uifn-light'
  | 'uifn-dark'
  | 'uifn-high-contrast-light'
  | 'uifn-high-contrast-dark';

export interface ThemeProviderState {
  theme: DesignTokenTheme;
  setTheme: (theme: FirstPartyThemeName | DesignTokenTheme) => DesignTokenTheme;
  getTheme: () => DesignTokenTheme;
}

function withFoundations(theme: DesignTokenTheme): DesignTokenTheme {
  return {
    ...theme,
    tokens: {
      ...createFoundationalTokens(),
      ...theme.tokens,
    },
  };
}

export const FIRST_PARTY_THEMES: Record<FirstPartyThemeName, DesignTokenTheme> = {
  'uifn-light': withFoundations(lightTheme as DesignTokenTheme),
  'uifn-dark': withFoundations(darkTheme as DesignTokenTheme),
  'uifn-high-contrast-light': withFoundations(highContrastLightTheme as DesignTokenTheme),
  'uifn-high-contrast-dark': withFoundations(highContrastDarkTheme as DesignTokenTheme),
};

export function getTheme(theme: FirstPartyThemeName | DesignTokenTheme): DesignTokenTheme {
  return typeof theme === 'string' ? FIRST_PARTY_THEMES[theme] : theme;
}

export function listFirstPartyThemes(): FirstPartyThemeName[] {
  return Object.keys(FIRST_PARTY_THEMES) as FirstPartyThemeName[];
}

export function createThemeProvider(initialTheme: FirstPartyThemeName | DesignTokenTheme = 'uifn-light'): ThemeProviderState {
  let currentTheme = getTheme(initialTheme);
  validateTokenTheme(currentTheme);

  return {
    get theme() {
      return currentTheme;
    },
    setTheme(nextTheme) {
      const candidate = getTheme(nextTheme);
      validateTokenTheme(candidate);
      currentTheme = candidate;
      return currentTheme;
    },
    getTheme() {
      return currentTheme;
    },
  };
}
