import { describe, expect, it, vi } from 'vitest';
import { createThemePreferenceController, preferenceAttributes } from '../preferences';

function media(matches: boolean) {
  const listeners = new Set<() => void>();
  return {
    matches,
    addEventListener: vi.fn((_type: 'change', listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: 'change', listener: () => void) => listeners.delete(listener)),
    emit(next: boolean) { this.matches = next; listeners.forEach((listener) => listener()); },
  };
}

describe('theme preferences', () => {
  it('TV-STYLE-001 resolves system preferences from an injected SSR-safe environment and cleans listeners', () => {
    const dark = media(false);
    const reduced = media(false);
    const forced = media(false);
    const controller = createThemePreferenceController({
      environment: { matchMedia: (query) => query.includes('color-scheme') ? dark : query.includes('reduced') ? reduced : forced },
      direction: 'rtl',
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    dark.emit(true);
    reduced.emit(true);
    forced.emit(true);
    expect(preferenceAttributes(controller.getSnapshot())).toEqual({
      'data-uifn-theme': 'uifn-dark',
      'data-uifn-density': 'comfortable',
      'data-uifn-reduced-motion': 'true',
      'data-uifn-forced-colors': 'true',
      dir: 'rtl',
    });
    expect(listener).toHaveBeenCalledTimes(3);
    controller.destroy();
    controller.destroy();
    expect(dark.removeEventListener).toHaveBeenCalledTimes(1);
    expect(reduced.removeEventListener).toHaveBeenCalledTimes(1);
    expect(forced.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('does not read ambient browser globals during construction', () => {
    const controller = createThemePreferenceController();
    expect(controller.getSnapshot().resolvedMode).toBe('light');
    controller.destroy();
  });
});
