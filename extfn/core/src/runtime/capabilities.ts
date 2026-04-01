import { ExtfnError, createExtfnError } from '../errors.js';
import type { BrowserTarget } from '../types.js';

export interface BrowserCapabilities {
  target: BrowserTarget;
  sidepanel: boolean;
  offscreen: boolean;
  scripting: boolean;
}

export interface PermissionSets {
  permissions?: readonly string[];
  optionalPermissions?: readonly string[];
  hostPermissions?: readonly string[];
}

export interface PermissionMergeInput {
  config?: PermissionSets;
  plugins?: readonly PermissionSets[];
}

export interface MergedPermissionSets {
  permissions: readonly string[];
  optionalPermissions: readonly string[];
  hostPermissions: readonly string[];
}

export const MAX_RUNTIME_PAYLOAD_BYTES = 8 * 1024 * 1024;

const CAPABILITY_MAP: Record<BrowserTarget, BrowserCapabilities> = {
  'chromium-mv3': {
    target: 'chromium-mv3',
    sidepanel: true,
    offscreen: true,
    scripting: true,
  },
  'firefox-mv3': {
    target: 'firefox-mv3',
    sidepanel: false,
    offscreen: false,
    scripting: true,
  },
};

const UNSUPPORTED_METHOD_PATHS: Partial<Record<BrowserTarget, readonly string[]>> = {
  'firefox-mv3': ['sidePanel', 'sidePanel.open', 'offscreen', 'offscreen.createDocument'],
};

export function getBrowserCapabilities(target: BrowserTarget): BrowserCapabilities {
  const capabilityMap = CAPABILITY_MAP[target];

  if (!capabilityMap) {
    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      `Capability registry emitted an invalid target capability map.`,
      { target }
    );
  }

  assertValidCapabilityMap(capabilityMap);
  return capabilityMap;
}

export function assertValidCapabilityMap(
  capabilities: BrowserCapabilities
): BrowserCapabilities {
  if (
    capabilities.target === 'firefox-mv3' &&
    capabilities.sidepanel
  ) {
    throw createExtfnError(
      'E_RUNTIME_PROTOCOL',
      'Capability registry emitted an invalid target capability map.',
      { capabilities }
    );
  }

  return capabilities;
}

export function assertSupportedBrowserMethodPath(
  target: BrowserTarget,
  path: string
): void {
  const unsupportedPrefixes = UNSUPPORTED_METHOD_PATHS[target] ?? [];

  if (
    unsupportedPrefixes.some((candidate) => path === candidate || path.startsWith(`${candidate}.`))
  ) {
    throw createExtfnError(
      'E_TARGET_UNSUPPORTED',
      `Browser method path is not supported on ${target}: ${path}`,
      { target, path }
    );
  }
}

export function mergeManifestPermissions(
  input: PermissionMergeInput
): MergedPermissionSets {
  return {
    permissions: mergePermissionCategory('permissions', [
      input.config?.permissions,
      ...(input.plugins ?? []).map((plugin) => plugin.permissions),
    ]),
    optionalPermissions: mergePermissionCategory('optionalPermissions', [
      input.config?.optionalPermissions,
      ...(input.plugins ?? []).map((plugin) => plugin.optionalPermissions),
    ]),
    hostPermissions: mergePermissionCategory('hostPermissions', [
      input.config?.hostPermissions,
      ...(input.plugins ?? []).map((plugin) => plugin.hostPermissions),
    ]),
  };
}

export function assertPayloadWithinLimit(
  payload: unknown,
  maxBytes = MAX_RUNTIME_PAYLOAD_BYTES
): number {
  const bytes = measurePayloadBytes(payload);

  if (bytes > maxBytes) {
    throw createExtfnError(
      'E_PAYLOAD_TOO_LARGE',
      `Payload exceeds 8 MiB limit.`,
      { bytes, maxBytes }
    );
  }

  return bytes;
}

export function measurePayloadBytes(payload: unknown): number {
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  return encoded.byteLength;
}

function mergePermissionCategory(
  category: keyof MergedPermissionSets,
  sources: readonly (readonly string[] | undefined)[]
): readonly string[] {
  const merged: string[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const value of source) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw createExtfnError(
          'E_CONFIG_INVALID',
          `Invalid ${category} declaration: ${String(value)}`,
          { category, value }
        );
      }

      if (seen.has(value)) {
        throw createExtfnError(
          'E_CONFIG_INVALID',
          `Duplicate ${category} declaration: ${value}`,
          { category, value }
        );
      }

      seen.add(value);
      merged.push(value);
    }
  }

  return merged.slice().sort((left, right) => left.localeCompare(right));
}
