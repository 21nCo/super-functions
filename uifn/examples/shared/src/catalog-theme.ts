import { getTheme, themeToVars, type FirstPartyThemeName } from '@uifn/theme';

const CATALOG_THEME_NAMES: Record<string, FirstPartyThemeName> = {
  light: 'uifn-light',
  dark: 'uifn-dark',
  'high-contrast-light': 'uifn-high-contrast-light',
  'high-contrast-dark': 'uifn-high-contrast-dark',
};

/** Public theme values used by the catalog and by clean-room consumer fixtures. */
export function catalogThemeStyle(theme: string): Record<`--uifn-${string}`, string> {
  return themeToVars(getTheme(CATALOG_THEME_NAMES[theme] ?? 'uifn-light'));
}
