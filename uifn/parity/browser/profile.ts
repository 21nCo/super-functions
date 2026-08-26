export type Phase14RenderingProfile =
  | 'ltr'
  | 'rtl'
  | 'forced-colors'
  | 'reduced-motion'
  | 'zoom-200'
  | 'zoom-400'
  | 'theme-light'
  | 'theme-dark'
  | 'high-contrast';

export function configureRenderingProfile(profile?: string): void {
  document.documentElement.dir = profile === 'rtl' ? 'rtl' : 'ltr';
  if (profile === 'theme-light') document.documentElement.dataset.uifnTheme = 'light';
  else if (profile === 'theme-dark') document.documentElement.dataset.uifnTheme = 'dark';
  else if (profile === 'high-contrast') document.documentElement.dataset.uifnTheme = 'high-contrast';
  else delete document.documentElement.dataset.uifnTheme;
}

export function inspectRenderingProfile(profile?: string): Record<string, unknown> | undefined {
  if (!profile) return undefined;
  const evidence = {
    profile,
    direction: getComputedStyle(document.documentElement).direction,
    forcedColors: matchMedia('(forced-colors: active)').matches,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    lightScheme: matchMedia('(prefers-color-scheme: light)').matches,
    darkScheme: matchMedia('(prefers-color-scheme: dark)').matches,
    visualViewportScale: window.visualViewport?.scale ?? 1,
    theme: document.documentElement.dataset.uifnTheme ?? null,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    canvasColor: getComputedStyle(document.documentElement).color,
    canvasBackground: getComputedStyle(document.documentElement).backgroundColor,
  };
  const scale = Number(evidence.visualViewportScale);
  const passed = profile === 'ltr' ? evidence.direction === 'ltr'
    : profile === 'rtl' ? evidence.direction === 'rtl'
    : profile === 'forced-colors' ? evidence.forcedColors === true
    : profile === 'reduced-motion' ? evidence.reducedMotion === true
    : profile === 'zoom-200' ? scale >= 1.95 && scale <= 2.05
    : profile === 'zoom-400' ? scale >= 3.95 && scale <= 4.05
    : profile === 'theme-light' ? evidence.lightScheme === true && evidence.theme === 'light'
    : profile === 'theme-dark' ? evidence.darkScheme === true && evidence.theme === 'dark'
    : profile === 'high-contrast' ? evidence.forcedColors === true && evidence.theme === 'high-contrast'
    : false;
  if (!passed) throw new Error(`Rendering profile ${profile} was not observably active: ${JSON.stringify(evidence)}`);
  return { ...evidence, passed: true };
}
