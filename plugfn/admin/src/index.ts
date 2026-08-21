export * from "./types.js";
export * from "./capability.js";
export * from "./adapter.js";
export * from "./client.js";
export * from "./domain-service.js";

import type { AdminCapabilityAdapter } from "@superfunctions/admin";
import { createPlugFnAdminAdapter } from "./adapter.js";
import { plugFnAdminCapability } from "./capability.js";
import { createPlugFnDomainAdminService } from "./domain-service.js";
import type { PlugFnDomainAdminServiceOptions } from "./types.js";

/** Creates the complete administration adapter from one project-owned PlugFn facade. */
export function createPlugFnDomainAdminAdapter(
  options: PlugFnDomainAdminServiceOptions,
): AdminCapabilityAdapter<typeof plugFnAdminCapability> {
  return createPlugFnAdminAdapter(createPlugFnDomainAdminService(options));
}

export const adminCapability = plugFnAdminCapability;
