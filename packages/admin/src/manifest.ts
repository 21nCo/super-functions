import type { AdminCapabilityManifest } from "./types.js";

/** Defines a capability while preserving literal operation identifiers for consumers. */
export function defineAdminCapability<const TManifest extends AdminCapabilityManifest>(
  manifest: TManifest,
): TManifest {
  return manifest;
}
