const themes = ['light', 'dark', 'high-contrast'] as const;
const directions = ['ltr', 'rtl'] as const;

export const globalTypes = {
  uifnTheme: { description: 'uifn theme', defaultValue: 'light', toolbar: { icon: 'paintbrush', items: [...themes] } },
  uifnDirection: { description: 'Writing direction', defaultValue: 'ltr', toolbar: { icon: 'transfer', items: [...directions] } },
  uifnReducedMotion: { description: 'Reduced motion', defaultValue: false, toolbar: { icon: 'timer', items: [{ value: false, title: 'Default motion' }, { value: true, title: 'Reduced motion' }] } },
  uifnForcedColors: { description: 'Forced colors fixture', defaultValue: false, toolbar: { icon: 'contrast', items: [{ value: false, title: 'Default colors' }, { value: true, title: 'Forced colors' }] } },
};

export const parameters = {
  controls: { expanded: true },
  // The release verifier owns the exhaustive axe run for every built iframe.
  // Keep the panel available without racing a second axe invocation in-browser.
  a11y: { test: 'off' },
  options: { storySort: { order: ['Stable'] } },
};

export const decorators = [
  (Story: () => unknown, context: { globals?: Record<string, unknown> }) => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.dataset.uifnTheme = String(context.globals?.uifnTheme ?? 'light');
      root.dataset.uifnReducedMotion = String(Boolean(context.globals?.uifnReducedMotion));
      root.dataset.uifnForcedColors = String(Boolean(context.globals?.uifnForcedColors));
      root.dir = context.globals?.uifnDirection === 'rtl' ? 'rtl' : 'ltr';
    }
    return Story();
  },
];

export default { globalTypes, parameters, decorators };
