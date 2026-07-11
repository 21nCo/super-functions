import type { BrowserTarget } from '@extfn/core';

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
    ...applyFirefoxBackground(manifest.background),
    browser_specific_settings: {
      ...browserSpecificSettings,
      gecko: {
        id: 'extfn@example.local',
        ...geckoSettings,
      },
    },
  };
}

// Firefox MV3 does not run a background `service_worker` by default (it is
// gated behind the disabled `extensions.backgroundServiceWorker.enabled`
// pref). Production Firefox extensions must declare `background.scripts`, so
// translate the Chromium-shaped service worker entry into an event-page script.
function applyFirefoxBackground(
  background: unknown
): { background?: Record<string, unknown> } {
  if (!isRecord(background)) {
    return {};
  }

  const serviceWorker = background.service_worker;
  if (typeof serviceWorker !== 'string') {
    return { background };
  }

  const { service_worker: _serviceWorker, ...rest } = background;

  return {
    background: {
      ...rest,
      scripts: [serviceWorker],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
