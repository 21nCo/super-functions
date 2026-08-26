import type { AdminCapabilityAdapter } from "@superfunctions/admin";
import {
  createSuperConsole,
  type SuperConsole,
  type SuperConsoleOptions,
} from "../src/lib/server/index.js";

export const DEV_ENABLED_ADMIN_MODULE_IDS = [
  "apifn",
  "authfn",
  "billfn",
  "botfn",
  "datafn",
  "filefn",
  "hostfn",
  "plugfn",
  "searchfn",
] as const;

export const DEV_UNAVAILABLE_ADMIN_MODULE_IDS = ["clifn", "extfn"] as const;

export const DEV_REGISTERED_ADMIN_MODULE_IDS = [
  ...DEV_ENABLED_ADMIN_MODULE_IDS,
  ...DEV_UNAVAILABLE_ADMIN_MODULE_IDS,
] as const;

export type DevAdminModuleId = (typeof DEV_REGISTERED_ADMIN_MODULE_IDS)[number];

export type DevAdminAdapters = Readonly<Record<DevAdminModuleId, AdminCapabilityAdapter>>;

export interface DevAdminSelection {
  adapters: readonly AdminCapabilityAdapter[];
  enabledModules: readonly (typeof DEV_ENABLED_ADMIN_MODULE_IDS)[number][];
}

/**
 * The representative `dev` composition is an explicit allowlist. CliFn and
 * ExtFn remain registered so discovery can explain why they are unavailable,
 * but they are never enabled without a domain-backed operator service.
 */
export function selectDevAdminAdapters(adapters: DevAdminAdapters): DevAdminSelection {
  const registered = DEV_REGISTERED_ADMIN_MODULE_IDS.map((moduleId) => {
    const adapter = adapters[moduleId];
    if (adapter.manifest.id !== moduleId) {
      throw new Error(`The dev admin adapter registered as ${moduleId} exposes manifest ${adapter.manifest.id}.`);
    }
    return adapter;
  });

  for (const moduleId of DEV_ENABLED_ADMIN_MODULE_IDS) {
    if (adapters[moduleId].manifest.availability === "unavailable") {
      throw new Error(`The dev admin module ${moduleId} cannot be enabled without a domain-backed service.`);
    }
  }
  for (const moduleId of DEV_UNAVAILABLE_ADMIN_MODULE_IDS) {
    if (adapters[moduleId].manifest.availability !== "unavailable") {
      throw new Error(`The dev admin module ${moduleId} must remain explicitly unavailable until it has a safe operator service.`);
    }
  }

  return {
    adapters: registered,
    enabledModules: DEV_ENABLED_ADMIN_MODULE_IDS,
  };
}

export type DevSuperConsoleOptions = Omit<SuperConsoleOptions, "adapters" | "enabledModules"> & {
  adapters: DevAdminAdapters;
};

/** Compose this from real function-owned adapters and deployment-owned infrastructure. */
export function createDevSuperConsoleInstallation(options: DevSuperConsoleOptions): SuperConsole {
  const { adapters, ...infrastructure } = options;
  return createSuperConsole({
    ...infrastructure,
    ...selectDevAdminAdapters(adapters),
  });
}
