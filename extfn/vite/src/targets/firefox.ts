import type { BrowserTarget } from 'extfn';

export const FIREFOX_TARGET: BrowserTarget = 'firefox-mv3';

export function applyFirefoxTargetManifest(
  manifest: Record<string, unknown>
): Record<string, unknown> {
  const browserSpecificSettings = isRecord(manifest.browser_specific_settings)
    ? manifest.browser_specific_settings
    : {};
  const geckoSettings = isRecord(browserSpecificSettings.gecko)
    ? browserSpecificSettings.gecko
    : {};

  return {
    ...manifest,
    browser_specific_settings: {
      ...browserSpecificSettings,
      gecko: {
        id: 'extfn@example.local',
        ...geckoSettings,
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
