import { describe, expect, it } from "vitest";
import { memoryAdapter } from "@superfunctions/db/adapters";
import type { Adapter } from "@superfunctions/db";
import { QueryFailedError } from "@superfunctions/db";
import {
  DbAdapterOAuthConsentStore,
  DbAdapterOAuthRevocationFailureStore,
  DbAdapterOAuthStateStore,
  DbAdapterTokenVault,
  OAuthDbAdapterError,
  createOAuthDbStorage
} from "../src/index.js";

describe("oauth-storage db adapter bridge", () => {
  it("supports oauth state, token, consent, and revocation-failure lifecycle via @superfunctions/db adapter", async () => {
    const adapter = memoryAdapter();
    await adapter.initialize();

    const { stateStore, tokenVault, consentStore, revocationFailureStore, models } = createOAuthDbStorage({ adapter });
    expect(models.oauthStates).toBe("oauth_states");
    expect(models.oauthTokenVault).toBe("oauth_tokens");
    expect(models.oauthConsents).toBe("oauth_consents");
    expect(models.oauthRevocationFailures).toBe("oauth_revocation_failures");

    await stateStore.put({
      stateId: "st_db_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_db_1",
        regionId: "eu-west-1"
      },
      redirectUri: "https://app.example/callback",
      requestedScopes: ["openid"],
      codeVerifier: "verifier",
      nonce: "nonce",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z"
    });

    const state = await stateStore.get("st_db_1");
    expect(state?.subject).toMatchObject({
      kind: "browser-auth",
      intentId: "intent_db_1"
    });

    const consumed = await stateStore.consume("st_db_1", "2026-01-01T00:01:00.000Z");
    expect(consumed?.consumedAt).toBe("2026-01-01T00:01:00.000Z");
    const replay = await stateStore.consume("st_db_1", "2026-01-01T00:02:00.000Z");
    expect(replay).toBeNull();

    await tokenVault.put({
      tokenId: "tok_db_1",
      tenantId: "t1",
      userId: "u1",
      providerId: "google",
      connectionId: "conn_db_1",
      encryptedPayload: "{\"accessToken\":\"a1\"}",
      keyRef: "kms_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const tokenById = await tokenVault.get("tok_db_1");
    expect(tokenById?.connectionId).toBe("conn_db_1");

    const tokenByConnection = await tokenVault.getByConnection("conn_db_1");
    expect(tokenByConnection?.tokenId).toBe("tok_db_1");

    await expect(tokenVault.rotateKey("tok_db_1", "kms_2")).rejects.toThrowError(
      "Token key rotation requires re-encryption"
    );
    expect((await tokenVault.get("tok_db_1"))?.keyRef).toBe("kms_1");

    await consentStore.put({
      consentId: "consent_db_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_db_1"
      },
      scopes: ["openid"],
      grantedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    const consents = await consentStore.listBySubject("google", {
      kind: "browser-auth",
      intentId: "intent_db_1"
    });
    expect(consents).toHaveLength(1);

    await revocationFailureStore.put({
      failureId: "revfail_db_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_db_1"
      },
      tokenId: "tok_db_1",
      errorCode: "provider_revoke_failed",
      errorMessage: "rate limited",
      retryable: true,
      occurredAt: "2026-01-01T00:00:00.000Z"
    });

    const failures = await revocationFailureStore.listBySubject("google", {
      kind: "browser-auth",
      intentId: "intent_db_1"
    });
    expect(failures).toHaveLength(1);

    await tokenVault.deleteByConnection("conn_db_1");
    expect(await tokenVault.getByConnection("conn_db_1")).toBeNull();
  });

  it("supports explicit model mapping overrides", async () => {
    const adapter = memoryAdapter();
    await adapter.initialize();

    const stateStore = new DbAdapterOAuthStateStore(adapter, "oauth_states_custom");
    const tokenVault = new DbAdapterTokenVault(adapter, "oauth_tokens_custom");
    const consentStore = new DbAdapterOAuthConsentStore(adapter, "oauth_consents_custom");
    const revocationFailureStore = new DbAdapterOAuthRevocationFailureStore(
      adapter,
      "oauth_revocation_failures_custom"
    );

    await stateStore.put({
      stateId: "st_custom_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_custom_1"
      },
      redirectUri: "https://app.example/callback",
      requestedScopes: ["openid"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z"
    });

    await tokenVault.put({
      tokenId: "tok_custom_1",
      tenantId: "t1",
      userId: "u1",
      providerId: "google",
      connectionId: "conn_custom_1",
      encryptedPayload: "{\"accessToken\":\"a1\"}",
      keyRef: "kms_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    await consentStore.put({
      consentId: "consent_custom_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_custom_1"
      },
      scopes: ["openid"],
      grantedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    await revocationFailureStore.put({
      failureId: "revfail_custom_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_custom_1"
      },
      errorCode: "rate_limited",
      errorMessage: "retry later",
      retryable: true,
      occurredAt: "2026-01-01T00:00:00.000Z"
    });

    expect((await stateStore.get("st_custom_1"))?.stateId).toBe("st_custom_1");
    expect((await tokenVault.getByConnection("conn_custom_1"))?.tokenId).toBe("tok_custom_1");
    expect((await consentStore.get("consent_custom_1"))?.consentId).toBe("consent_custom_1");
    expect((await revocationFailureStore.get("revfail_custom_1"))?.failureId).toBe("revfail_custom_1");
  });

  it("accepts parsed JSON objects from adapters like Drizzle", async () => {
    const adapter = createParsedJsonAdapter();
    await adapter.initialize?.();

    const { stateStore, consentStore, revocationFailureStore } = createOAuthDbStorage({ adapter });

    await stateStore.put({
      stateId: "st_json_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_json_1"
      },
      redirectUri: "https://app.example/callback",
      requestedScopes: ["openid", "profile"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z"
    });

    await consentStore.put({
      consentId: "consent_json_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_json_1"
      },
      scopes: ["openid"],
      grantedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        mode: "parsed"
      }
    });

    await revocationFailureStore.put({
      failureId: "revfail_json_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_json_1"
      },
      errorCode: "rate_limited",
      errorMessage: "retry later",
      retryable: true,
      occurredAt: "2026-01-01T00:00:00.000Z",
      metadata: {
        reason: "parsed"
      }
    });

    expect((await stateStore.get("st_json_1"))?.requestedScopes).toEqual(["openid", "profile"]);
    expect((await consentStore.get("consent_json_1"))?.metadata).toEqual({ mode: "parsed" });
    expect((await revocationFailureStore.get("revfail_json_1"))?.metadata).toEqual({ reason: "parsed" });
  });

  it("rethrows unexpected adapter failures during state consumption", async () => {
    const adapter = memoryAdapter();
    await adapter.initialize();

    const stateStore = new DbAdapterOAuthStateStore(adapter);
    await stateStore.put({
      stateId: "st_db_error",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_db_error"
      },
      redirectUri: "https://app.example/callback",
      requestedScopes: ["openid"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:10:00.000Z"
    });

    const failingAdapter: Adapter = {
      ...adapter,
      update: async () => {
        throw new QueryFailedError("db unavailable");
      }
    };

    await expect(
      new DbAdapterOAuthStateStore(failingAdapter).consume("st_db_error", "2026-01-01T00:01:00.000Z")
    ).rejects.toMatchObject({
      message: "db unavailable"
    });
  });

  it("rejects invalid parsed JSON values from adapters deterministically", async () => {
    const adapter = createMalformedParsedJsonAdapter();
    await adapter.initialize?.();

    const { stateStore, consentStore } = createOAuthDbStorage({ adapter });

    await stateStore.put({
      stateId: "st_bad_json_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_bad_json_1"
      },
      redirectUri: "https://app.example/callback",
      requestedScopes: ["openid"],
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:05:00.000Z"
    });

    await consentStore.put({
      consentId: "consent_bad_json_1",
      providerId: "google",
      subject: {
        kind: "browser-auth",
        intentId: "intent_bad_json_1"
      },
      scopes: ["openid"],
      grantedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    });

    await expect(stateStore.get("st_bad_json_1")).rejects.toThrowError(
      "requested_scopes must be an array of strings"
    );
    await expect(consentStore.get("consent_bad_json_1")).rejects.toThrowError(
      "metadata must be an object"
    );
  });

  it("fails deterministically when required schema mapping is missing", async () => {
    const adapter = memoryAdapter();
    await adapter.initialize();

    expect(() => createOAuthDbStorage({ adapter, models: { oauthStates: "" } })).toThrowError(OAuthDbAdapterError);
    expect(() => createOAuthDbStorage({ adapter, models: { oauthTokenVault: "" } })).toThrowError(
      "oauth_tokens model mapping required"
    );
    expect(() => createOAuthDbStorage({ adapter, models: { oauthConsents: "" } })).toThrowError(
      "oauth_consents model mapping required"
    );
    expect(() => createOAuthDbStorage({ adapter, models: { oauthRevocationFailures: "" } })).toThrowError(
      "oauth_revocation_failures model mapping required"
    );
  });
});

function createParsedJsonAdapter(): Adapter {
  const adapter = memoryAdapter();
  return {
    ...adapter,
    findOne: async (params) => {
      const value = await adapter.findOne(params);
      return value ? parseStoredJsonFields(value as Record<string, unknown>) : value;
    },
    findMany: async (params) =>
      (await adapter.findMany(params)).map((value) => parseStoredJsonFields(value as Record<string, unknown>)),
    update: async (params) => parseStoredJsonFields(await adapter.update(params) as Record<string, unknown>),
    upsert: async (params) => parseStoredJsonFields(await adapter.upsert(params) as Record<string, unknown>)
  };
}

function createMalformedParsedJsonAdapter(): Adapter {
  const adapter = memoryAdapter();
  return {
    ...adapter,
    findOne: async (params) => {
      const value = await adapter.findOne(params);
      if (!value) {
        return value;
      }

      const record = parseStoredJsonFields(value as Record<string, unknown>);
      if (record.state_id === "st_bad_json_1") {
        record.requested_scopes = ["openid", 7];
      }

      if (record.consent_id === "consent_bad_json_1") {
        record.metadata = ["not-an-object"];
      }

      return record;
    }
  };
}

function parseStoredJsonFields(record: Record<string, unknown>): Record<string, unknown> {
  const nextRecord = { ...record };
  for (const key of ["subject_payload", "requested_scopes", "scope_set", "metadata"]) {
    const value = nextRecord[key];
    if (typeof value === "string") {
      nextRecord[key] = JSON.parse(value);
    }
  }
  return nextRecord;
}
