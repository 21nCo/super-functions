export * from "./types.js";
export * from "./capability.js";
export * from "./adapter.js";
export * from "./client.js";
export * from "./domain-service.js";

import type { AdminCapabilityAdapter } from "@superfunctions/admin";
import { createSendFnAdminAdapter } from "./adapter.js";
import { sendFnAdminCapability } from "./capability.js";
import { createSendFnDomainAdminService } from "./domain-service.js";
import type { SendFnDomainAdminServiceOptions } from "./types.js";

/** Creates a complete adapter directly from a project-owned public SendFn client. */
export function createSendFnDomainAdminAdapter(
  options: SendFnDomainAdminServiceOptions,
): AdminCapabilityAdapter<typeof sendFnAdminCapability> {
  return createSendFnAdminAdapter(createSendFnDomainAdminService(options));
}

export const adminCapability = sendFnAdminCapability;
