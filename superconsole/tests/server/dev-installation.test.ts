import {
  MemoryAdminAuditSink,
  MemoryAdminIdempotencyStore,
  createAdminCapabilityAdapter,
  defineAdminCapability,
  type AdminCapabilityManifest,
} from "@superfunctions/admin";
import { cliFnAdminAdapter } from "@clifn/admin";
import { extFnAdminAdapter } from "@extfn/admin";
import { describe, expect, it } from "vitest";
import {
  DEV_ENABLED_ADMIN_MODULE_IDS,
  DEV_REGISTERED_ADMIN_MODULE_IDS,
  createDevSuperConsoleInstallation,
  selectDevAdminAdapters,
  type DevAdminAdapters,
} from "../../examples/dev-installation.js";

function bind(manifest: AdminCapabilityManifest) {
  return createAdminCapabilityAdapter(
    manifest,
    Object.fromEntries(manifest.operations.map((operation) => [
      operation.id,
      async () => ({ ok: true, data: {} }),
    ])),
  );
}

function availableCapability(id: string): AdminCapabilityManifest {
  return defineAdminCapability({
    schemaVersion: "1.0",
    id,
    displayName: id,
    version: "1.0.0",
    description: `Representative domain-backed ${id} adapter.`,
    category: "dev",
    availability: "required-product",
    scopeLevels: ["installation"],
    dependencies: [],
    resources: [],
    operations: [],
  });
}

function devAdapters(): DevAdminAdapters {
  return {
    apifn: bind(availableCapability("apifn")),
    authfn: bind(availableCapability("authfn")),
    billfn: bind(availableCapability("billfn")),
    botfn: bind(availableCapability("botfn")),
    clifn: cliFnAdminAdapter,
    datafn: bind(availableCapability("datafn")),
    extfn: extFnAdminAdapter,
    filefn: bind(availableCapability("filefn")),
    hostfn: bind(availableCapability("hostfn")),
    plugfn: bind(availableCapability("plugfn")),
    searchfn: bind(availableCapability("searchfn")),
  };
}

describe("representative dev installation", () => {
  it("registers every common dev adapter but enables only domain-backed modules", () => {
    const selection = selectDevAdminAdapters(devAdapters());
    expect(selection.adapters.map((adapter) => adapter.manifest.id)).toEqual(DEV_REGISTERED_ADMIN_MODULE_IDS);
    expect(selection.enabledModules).toEqual(DEV_ENABLED_ADMIN_MODULE_IDS);
    expect(selection.adapters.filter((adapter) => adapter.manifest.availability === "unavailable").map((adapter) => adapter.manifest.id)).toEqual(["clifn", "extfn"]);
  });

  it("creates an executable registry without enabling CliFn or ExtFn", () => {
    const console = createDevSuperConsoleInstallation({
      adapters: devAdapters(),
      auth: {
        authenticate: async () => null,
        authorizeScope: async () => null,
        authorizeMutation: async () => undefined,
      },
      shellPolicy: { authorize: () => true },
      audit: new MemoryAdminAuditSink(),
      idempotency: new MemoryAdminIdempotencyStore(),
      confirmation: {
        issue: async () => ({ token: "test", expiresAt: new Date(Date.now() + 60_000).toISOString() }),
        prepareActivation: async () => undefined,
        cancelActivation: async () => undefined,
        activate: async () => undefined,
        revoke: async () => undefined,
        verify: async () => true,
      },
      openApiSecuritySchemes: {
        operatorSession: { type: "apiKey", in: "cookie", name: "session" },
        operatorApiKey: { type: "http", scheme: "bearer" },
      },
    });

    expect(console.registry.enabledModuleIds).toEqual(DEV_ENABLED_ADMIN_MODULE_IDS);
    expect(console.registry.enabledModuleIds).not.toContain("clifn");
    expect(console.registry.enabledModuleIds).not.toContain("extfn");
  });

  it("fails closed if an unavailable declaration is accidentally treated as enabled", () => {
    const adapters = { ...devAdapters(), clifn: bind(availableCapability("apifn")) } as DevAdminAdapters;
    expect(() => selectDevAdminAdapters(adapters)).toThrow(/registered as clifn exposes manifest apifn/);
  });
});
