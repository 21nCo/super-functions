export type ThemePreference = 'light' | 'dark' | 'system';
export type ThemeDensity = 'compact' | 'comfortable' | 'spacious';
export type ThemeDirection = 'ltr' | 'rtl';

export interface PreferenceMediaQueryList {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
}

export interface ThemePreferenceEnvironment {
  matchMedia?: (query: string) => PreferenceMediaQueryList;
}

export interface ThemePreferenceSnapshot {
  readonly preference: ThemePreference;
  readonly resolvedMode: 'light' | 'dark';
  readonly density: ThemeDensity;
  readonly direction: ThemeDirection;
  readonly forcedColors: boolean;
  readonly reducedMotion: boolean;
}

export interface CreateThemePreferenceOptions {
  preference?: ThemePreference;
  density?: ThemeDensity;
  direction?: ThemeDirection;
  environment?: ThemePreferenceEnvironment;
}

export interface ThemePreferenceController {
  getSnapshot(): ThemePreferenceSnapshot;
  setPreference(preference: ThemePreference): void;
  setDensity(density: ThemeDensity): void;
  setDirection(direction: ThemeDirection): void;
  subscribe(listener: (snapshot: ThemePreferenceSnapshot) => void): () => void;
  destroy(): void;
}

export function createThemePreferenceController(options: CreateThemePreferenceOptions = {}): ThemePreferenceController {
  const environment = options.environment ?? {};
  const dark = environment.matchMedia?.('(prefers-color-scheme: dark)');
  const reduced = environment.matchMedia?.('(prefers-reduced-motion: reduce)');
  const forced = environment.matchMedia?.('(forced-colors: active)');
  let preference = options.preference ?? 'system';
  let density = options.density ?? 'comfortable';
  let direction = options.direction ?? 'ltr';
  let destroyed = false;
  const listeners = new Set<(snapshot: ThemePreferenceSnapshot) => void>();

  const snapshot = (): ThemePreferenceSnapshot => Object.freeze({
    preference,
    resolvedMode: preference === 'system' ? (dark?.matches ? 'dark' : 'light') : preference,
    density,
    direction,
    forcedColors: forced?.matches ?? false,
    reducedMotion: reduced?.matches ?? false,
  });
  const notify = () => {
    if (!destroyed) listeners.forEach((listener) => listener(snapshot()));
  };
  const queries = [dark, reduced, forced].filter(Boolean) as PreferenceMediaQueryList[];
  queries.forEach((query) => query.addEventListener ? query.addEventListener('change', notify) : query.addListener?.(notify));

  const assertAlive = () => {
    if (destroyed) throw new Error('UIFN_THEME_PREFERENCE_DESTROYED');
  };

  return {
    getSnapshot: snapshot,
    setPreference(next) { assertAlive(); preference = next; notify(); },
    setDensity(next) { assertAlive(); density = next; notify(); },
    setDirection(next) { assertAlive(); direction = next; notify(); },
    subscribe(listener) { assertAlive(); listeners.add(listener); return () => listeners.delete(listener); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      queries.forEach((query) => query.removeEventListener ? query.removeEventListener('change', notify) : query.removeListener?.(notify));
      listeners.clear();
    },
  };
}

export function preferenceAttributes(snapshot: ThemePreferenceSnapshot): Record<string, string> {
  return {
    'data-uifn-theme': `uifn-${snapshot.resolvedMode}`,
    'data-uifn-density': snapshot.density,
    'data-uifn-reduced-motion': String(snapshot.reducedMotion),
    'data-uifn-forced-colors': String(snapshot.forcedColors),
    dir: snapshot.direction,
  };
}
