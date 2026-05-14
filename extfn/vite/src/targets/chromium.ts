import type { BrowserTarget } from 'extfn';

export const CHROMIUM_TARGET: BrowserTarget = 'chromium-mv3';

export function applyChromiumTargetManifest(
  manifest: Record<string, unknown>
): Record<string, unknown> {
  return manifest;
}
