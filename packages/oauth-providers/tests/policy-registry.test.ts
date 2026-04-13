import { describe, expect, it } from "vitest";
import {
  MemoryProviderPolicyAuditStore,
  MemoryProviderPolicyConsentStore,
  ProviderPolicyError,
  ProviderPolicyRegistry,
  createDefaultProviderPolicyRegistry,
  listProviderPolicies
} from "../src/index.js";

describe("oauth-providers policy registry", () => {
  it("writes durable consent and audit records through async stores", async () => {
    const consentStore = new MemoryProviderPolicyConsentStore();
    const auditStore = new MemoryProviderPolicyAuditStore();
    const generatedIds = ["consent_fixed_01", "audit_fixed_01"];
    const registry = new ProviderPolicyRegistry(listProviderPolicies(), {
      consentStore,
      auditStore,
      idGenerator: () => {
        const next = generatedIds.shift();
        if (!next) {
          throw new Error("unexpected id request");
        }
        return next;
      },
      now: () => "2026-03-27T00:00:00.000Z"
    });

    const result = await registry.validateScopes({
      providerId: "google",
      feature: "mail.read.metadata",
      requestedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      tenantId: "tenant_1",
      userId: "user_1",
      purpose: "mail preview"
    });

    expect(result.authorized).toBe(true);
    expect(result.consentRecord).toMatchObject({
      consentId: "consent_fixed_01",
      policyVersion: "2026-03-11"
    });

    const audit = await registry.recordPolicyVersionUpdate({
      providerId: "google",
      newVersion: "2026-03-27",
      actor: "admin_1",
      reason: "compliance-update"
    });

    expect(audit).toMatchObject({
      auditEventId: "audit_fixed_01",
      fromVersion: "2026-03-11",
      toVersion: "2026-03-27"
    });

    await expect(consentStore.list()).resolves.toMatchObject([
      {
        consentId: "consent_fixed_01",
        policyVersion: "2026-03-11"
      }
    ]);
    await expect(auditStore.list()).resolves.toMatchObject([
      {
        auditEventId: "audit_fixed_01",
        fromVersion: "2026-03-11",
        toVersion: "2026-03-27"
      }
    ]);
  });

  it("surfaces deterministic store failures for consent persistence", async () => {
    const registry = new ProviderPolicyRegistry(listProviderPolicies(), {
      consentStore: {
        async put() {
          throw new Error("disk offline");
        },
        async list() {
          return [];
        }
      },
      auditStore: new MemoryProviderPolicyAuditStore(),
      idGenerator: () => "consent_failure_01",
      now: () => "2026-03-27T00:00:00.000Z"
    });

    await expect(
      registry.validateScopes({
        providerId: "google",
        feature: "mail.read.metadata",
        requestedScopes: ["https://www.googleapis.com/auth/gmail.readonly"],
        tenantId: "tenant_1",
        userId: "user_1",
        purpose: "mail preview"
      })
    ).rejects.toMatchObject({
      code: "PROVIDER_POLICY_STORE_FAILED",
      message: "failed to persist provider policy consent record"
    });
  });

  it("keeps the default registry usable as an in-memory convenience path with injected ids", async () => {
    const generatedIds = ["consent_test_01"];
    const registry = createDefaultProviderPolicyRegistry({
      idGenerator: () => {
        const next = generatedIds.shift();
        if (!next) {
          throw new Error("unexpected id request");
        }
        return next;
      },
      now: () => "2026-03-27T00:00:00.000Z"
    });

    const result = await registry.validateScopes({
      providerId: "github",
      feature: "profile.basic",
      requestedScopes: ["read:user", "user:email"],
      tenantId: "tenant_1",
      userId: "user_1",
      purpose: "profile import"
    });

    expect(result.authorized).toBe(true);
    expect(result.consentRecord.consentId).toBe("consent_test_01");
    await expect(registry.getConsentRecords()).resolves.toMatchObject([
      {
        consentId: "consent_test_01"
      }
    ]);
  });

  it("rejects disallowed scopes with OAUTH_SCOPE_DISALLOWED", async () => {
    const registry = createDefaultProviderPolicyRegistry(() => "2026-03-11T00:00:00.000Z");

    await expect(
      registry.validateScopes({
        providerId: "google",
        feature: "mail.read.metadata",
        requestedScopes: ["https://mail.google.com/"],
        tenantId: "t1",
        userId: "u1",
        purpose: "mail.read.metadata"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_SCOPE_DISALLOWED",
      message: "requested scope not allowed for feature"
    });
  });

  it("allows provider operation when policy permits it", () => {
    const registry = createDefaultProviderPolicyRegistry();
    const decision = registry.assertOperationAllowed({
      providerId: "google",
      operation: "mail.watch.create",
      featureMode: "metadata-only"
    });

    expect(decision.allowed).toBe(true);
    expect(decision.policyVersion).toBe("2026-03-11");
  });

  it("blocks disallowed operation in metadata-only mode", () => {
    const registry = createDefaultProviderPolicyRegistry();

    expect(() =>
      registry.assertOperationAllowed({
        providerId: "google",
        operation: "mail.read.fullbody",
        featureMode: "metadata-only"
      })
    ).toThrowError(
      expect.objectContaining({
        code: "PROVIDER_POLICY_BLOCKED",
        message: "operation not allowed by policy"
      })
    );
  });

  it("throws validation error for unknown provider policy", () => {
    const registry = createDefaultProviderPolicyRegistry();

    expect(() => registry.getPolicy("unknown" as never)).toThrowError(ProviderPolicyError);
  });
});
