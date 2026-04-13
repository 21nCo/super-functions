import { describe, expect, it, vi } from "vitest";
import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import { AesGcmTokenCipher, EncryptedTokenVault, MemoryOAuthStateStore, MemoryTokenVault } from "@superfunctions/oauth-storage";
import { createOAuthFlowService, type OAuthFlowEvent } from "../index.js";

const provider: OAuthProviderDescriptor = {
  id: "google",
  authorizationUrl: "https://accounts.google.example/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.example/token",
  revocationUrl: "https://oauth2.googleapis.example/revoke",
  defaultScopes: ["openid", "email"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

function createHarness(options?: {
  useEncryptedVault?: boolean;
  tokenStorageMode?: "encrypted-required" | "plaintext-unsafe";
}) {
  const events: OAuthFlowEvent[] = [];
  const stateStore = new MemoryOAuthStateStore();
  const backingStore = new MemoryTokenVault();
  const tokenVault = options?.useEncryptedVault
    ? new EncryptedTokenVault(
        backingStore,
        new AesGcmTokenCipher((keyRef) => {
          if (keyRef !== "oauth-default") {
            throw new Error(`unexpected keyRef: ${keyRef}`);
          }
          return Buffer.from("55".repeat(32), "hex");
        }),
        () => "2026-01-01T00:00:00.000Z"
      )
    : backingStore;
  const tokenHttpClient = {
    exchangeToken: vi.fn(async (input) => {
      if (input.grantType === "refresh_token") {
        return {
          accessToken: "access-refreshed",
          refreshToken: "refresh-existing",
          expiresIn: 3600,
          tokenType: "Bearer"
        };
      }

      return {
        accessToken: "access-browser",
        refreshToken: "refresh-browser",
        expiresIn: 3600,
        tokenType: "Bearer",
        scope: "openid email",
        idToken: "id-token-browser"
      };
    }),
    revokeToken: vi.fn(async () => {})
  };

  const service = createOAuthFlowService({
    providers: { google: provider },
    providerRuntimeConfig: {
      google: {
        clientId: "client_google",
        clientSecret: "secret_google",
        allowlistedRedirectUris: ["https://app.example/callback"]
      }
    },
    stateStore,
    tokenVault,
    tokenStorageMode: options?.tokenStorageMode ?? "plaintext-unsafe",
    tokenHttpClient,
    emitEvent: (event) => events.push(event),
    now: () => new Date("2026-01-01T00:00:00.000Z")
  });

  return { service, stateStore, tokenVault, backingStore, tokenHttpClient, events };
}

describe("oauth-flow browser-auth lifecycle", () => {
  it("completes browser-auth callbacks without a pre-known local user", async () => {
    const { service, tokenVault } = createHarness();

    const started = await service.start({
      providerId: "google",
      redirectUri: "https://app.example/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_01",
        regionId: "eu-west-1",
        returnTo: "https://app.example/post-auth"
      },
      requestId: "req_browser_1"
    });

    const callback = await service.handleCallback({
      code: "code_browser_1",
      state: started.stateId,
      redirectUri: "https://app.example/callback",
      requestId: "req_browser_2"
    });

    expect(callback.providerId).toBe("google");
    expect(callback.subject).toMatchObject({
      kind: "browser-auth",
      intentId: "intent_01",
      regionId: "eu-west-1",
      returnTo: "https://app.example/post-auth"
    });
    expect(callback.tokenSet.accessToken).toBe("access-browser");
    expect(callback.connectionId).toBeUndefined();
    expect(callback.tokenRecordId).toBeUndefined();
    expect(await tokenVault.getByConnection("conn_intent_01")).toBeNull();
  });

  it("persists tokens after browser-auth identity resolution hooks run", async () => {
    const { stateStore, tokenVault, backingStore, tokenHttpClient, events } = createHarness({
      useEncryptedVault: true,
      tokenStorageMode: "encrypted-required"
    });
    const service = createOAuthFlowService({
      providers: { google: provider },
      providerRuntimeConfig: {
        google: {
          clientId: "client_google",
          clientSecret: "secret_google",
          allowlistedRedirectUris: ["https://app.example/callback"]
        }
      },
      stateStore,
      tokenVault,
      tokenStorageMode: "encrypted-required",
      tokenHttpClient,
      emitEvent: (event) => events.push(event),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      identityHooks: {
        resolveBrowserAuthIdentity: async ({ subject }) => ({
          tenantId: "tenant_resolved",
          userId: "user_resolved",
          connectionId: `conn_${subject.intentId}`
        })
      }
    });

    const started = await service.start({
      providerId: "google",
      redirectUri: "https://app.example/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_02"
      }
    });

    const callback = await service.handleCallback({
      code: "code_browser_2",
      state: started.stateId,
      redirectUri: "https://app.example/callback"
    });

    expect(callback.resolvedIdentity).toEqual({
      tenantId: "tenant_resolved",
      userId: "user_resolved",
      connectionId: "conn_intent_02",
      metadata: undefined,
      persistTokens: undefined
    });
    expect(callback.connectionId).toBe("conn_intent_02");
    expect(callback.tokenRecordId).toMatch(/^tok_/);

    const stored = await backingStore.getByConnection("conn_intent_02");
    expect(stored?.providerId).toBe("google");
    expect(stored?.encryptedPayload).toBeDefined();
    expect(stored?.encryptedPayload).not.toContain("access-browser");
    expect(stored?.encryptedPayload).not.toContain("refresh-browser");
  });

  it("wraps browser-auth identity hook failures with OAUTH_HOOK_FAILED and emits redaction-safe events", async () => {
    const { stateStore, tokenVault, tokenHttpClient, events } = createHarness();
    const service = createOAuthFlowService({
      providers: { google: provider },
      providerRuntimeConfig: {
        google: {
          clientId: "client_google",
          clientSecret: "secret_google",
          allowlistedRedirectUris: ["https://app.example/callback"]
        }
      },
      stateStore,
      tokenVault,
      tokenHttpClient,
      emitEvent: (event) => events.push(event),
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      identityHooks: {
        resolveBrowserAuthIdentity: async () => {
          throw new Error("client secret leaked? secret_google access-browser refresh-browser");
        }
      }
    });

    const started = await service.start({
      providerId: "google",
      redirectUri: "https://app.example/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_03"
      }
    });

    await expect(
      service.handleCallback({
        code: "code_browser_3",
        state: started.stateId,
        redirectUri: "https://app.example/callback",
        requestId: "req_browser_3"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_HOOK_FAILED",
      status: 500
    });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).toContain("oauth.flow.started");
    expect(serializedEvents).toContain("oauth.flow.callback.failed");
    expect(serializedEvents).not.toContain("secret_google");
    expect(serializedEvents).not.toContain("access-browser");
    expect(serializedEvents).not.toContain("refresh-browser");
  });
});
