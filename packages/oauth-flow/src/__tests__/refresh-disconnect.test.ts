import { describe, expect, it, vi } from "vitest";
import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
import { OAuthHttpError } from "@superfunctions/oauth-http";
import { AesGcmTokenCipher, EncryptedTokenVault, MemoryOAuthStateStore, MemoryTokenVault } from "@superfunctions/oauth-storage";
import { createOAuthFlowService, type OAuthFlowConnectionCleanup, type OAuthFlowEvent, type OAuthFlowIdentityHooks } from "../index.js";

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
  startAt?: string;
  useEncryptedVault?: boolean;
  tokenStorageMode?: "encrypted-required" | "plaintext-unsafe";
  identityHooks?: OAuthFlowIdentityHooks;
}) {
  const startAt = options?.startAt ?? "2026-01-01T00:00:00.000Z";
  let nowMs = Date.parse(startAt);
  const now = () => new Date(nowMs);
  const advanceMs = (ms: number) => {
    nowMs += ms;
  };

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
          return Buffer.from("66".repeat(32), "hex");
        }),
        () => now().toISOString()
      )
    : backingStore;

  const tokenHttpClient = {
    exchangeToken: vi.fn(async (input) => {
      if (input.grantType === "authorization_code") {
        return {
          accessToken: "access-old",
          refreshToken: "refresh-old",
          expiresIn: 3600,
          tokenType: "Bearer",
          scope: "openid email"
        };
      }

      return {
        accessToken: "access-new",
        refreshToken: undefined,
        expiresIn: 7200,
        tokenType: "Bearer",
        scope: "openid email"
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
    identityHooks: options?.identityHooks,
    now,
    emitEvent: (event) => events.push(event)
  });

  return { service, tokenVault, backingStore, events, tokenHttpClient, advanceMs };
}

async function seedConnection(service: ReturnType<typeof createHarness>["service"], connectionId: string): Promise<void> {
  const started = await service.start({
    providerId: "google",
    tenantId: "tenant_1",
    userId: "user_1",
    connectionId,
    redirectUri: "https://app.example/callback"
  });

  await service.handleCallback({
    code: "auth-code",
    state: started.stateId,
    redirectUri: "https://app.example/callback"
  });
}

describe("oauth-flow refresh/disconnect lifecycle", () => {
  it("refresh() preserves existing refresh token when provider omits replacement", async () => {
    const { service, tokenVault, backingStore, advanceMs, events } = createHarness({
      useEncryptedVault: true,
      tokenStorageMode: "encrypted-required"
    });
    await seedConnection(service, "conn_1");
    advanceMs(30_000);

    const refreshed = await service.refresh({
      connectionId: "conn_1",
      providerId: "google",
      redirectUri: "https://app.example/callback"
    });

    expect(refreshed.accessToken).toBe("access-new");
    expect(refreshed.refreshToken).toBe("refresh-old");
    expect(events.some((event) => event.name === "oauth.flow.refresh.success")).toBe(true);

    const stored = await backingStore.getByConnection("conn_1");
    expect(stored).not.toBeNull();
    expect(stored!.encryptedPayload).not.toContain("access-new");
    expect(stored!.encryptedPayload).not.toContain("refresh-old");

    if (!("getTokenSetByConnection" in tokenVault)) {
      throw new Error("expected encrypted token vault");
    }

    const decrypted = await tokenVault.getTokenSetByConnection("conn_1");
    expect(decrypted?.tokenSet.accessToken).toBe("access-new");
    expect(decrypted?.tokenSet.refreshToken).toBe("refresh-old");
  });

  it("refresh() failure keeps prior token record intact", async () => {
    const { service, tokenVault, tokenHttpClient, events } = createHarness();
    await seedConnection(service, "conn_2");

    const before = await tokenVault.getByConnection("conn_2");
    expect(before).not.toBeNull();

    tokenHttpClient.exchangeToken = vi.fn(async (input) => {
      if (input.grantType === "authorization_code") {
        return {
          accessToken: "access-old",
          refreshToken: "refresh-old"
        };
      }

      throw new OAuthHttpError("invalid_grant", {
        code: "OAUTH_TOKEN_REFRESH_FAILED",
        status: 400,
        retryable: false
      });
    });

    await expect(
      service.refresh({
        connectionId: "conn_2",
        providerId: "google",
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_REFRESH_FAILED"
    });

    expect(events.some((event) => event.name === "oauth.flow.refresh.failed")).toBe(true);

    const after = await tokenVault.getByConnection("conn_2");
    expect(after).toEqual(before);
  });

  it("refresh() rejects plaintext persistence by default and leaves the existing record untouched", async () => {
    const { service, tokenVault, events } = createHarness({
      tokenStorageMode: "encrypted-required"
    });

    await tokenVault.put({
      tokenId: "tok_plain_existing",
      tenantId: "tenant_1",
      userId: "user_1",
      providerId: "google",
      connectionId: "conn_plain_existing",
      encryptedPayload: JSON.stringify({
        accessToken: "access-old",
        refreshToken: "refresh-old",
        expiresAt: "2026-01-01T01:00:00.000Z",
        tokenType: "Bearer",
        scope: "openid email"
      }),
      keyRef: "oauth-default",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z"
    });

    const before = await tokenVault.getByConnection("conn_plain_existing");

    await expect(
      service.refresh({
        connectionId: "conn_plain_existing",
        providerId: "google",
        redirectUri: "https://app.example/callback",
        requestId: "req_plain_refresh"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_STORAGE_UNSAFE",
      message: "encrypted token storage is required unless plaintext-unsafe mode is explicitly enabled",
      status: 500,
      retryable: false
    });

    const after = await tokenVault.getByConnection("conn_plain_existing");
    expect(after).toEqual(before);

    const failureEvent = events.find((event) => event.name === "oauth.flow.refresh.failed");
    expect(failureEvent).toMatchObject({
      providerId: "google",
      requestId: "req_plain_refresh",
      errorCode: "OAUTH_TOKEN_STORAGE_UNSAFE"
    });
    expect(failureEvent?.details).toMatchObject({
      operation: "refresh",
      providerId: "google",
      connectionId: "conn_plain_existing",
      storageMode: "encrypted-required",
      vaultKind: "plaintext"
    });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("access-old");
    expect(serializedEvents).not.toContain("refresh-old");
    expect(serializedEvents).not.toContain("secret_google");
    expect(serializedEvents).not.toContain("encryptedPayload");
  });

  it("disconnect() reports not-configured cleanup when no disconnect hook exists", async () => {
    const { service, tokenVault, events } = createHarness();
    await seedConnection(service, "conn_3");

    const result = await service.disconnect({
      connectionId: "conn_3",
      providerId: "google",
      revokeRemote: false
    });

    expect(result).toEqual({
      disconnected: true,
      remoteRevokeAttempted: false,
      localTokenDeleted: true,
      connectionCleanup: {
        attempted: false,
        deleted: false,
        reason: "not-configured"
      },
      connectionDeleted: false
    });
    expect(await tokenVault.getByConnection("conn_3")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.disconnect.success",
        details: {
          remoteRevokeAttempted: false,
          localDeleted: true,
          cleanupAttempted: false,
          cleanupDeleted: false,
          cleanupReason: "not-configured"
        }
      })
    );
  });

  it("disconnect() uses hook cleanup results and passes normalized disconnect context", async () => {
    const onDisconnected = vi.fn(async () => ({
      attempted: true,
      deleted: true,
      reason: "deleted"
    } satisfies OAuthFlowConnectionCleanup));
    const { service, tokenVault, events } = createHarness({
      identityHooks: { onDisconnected }
    });
    await seedConnection(service, "conn_4");

    const result = await service.disconnect({
      connectionId: "conn_4",
      providerId: "google",
      revokeRemote: true,
      requestId: "req_disconnect_1"
    });

    expect(result).toEqual({
      disconnected: true,
      remoteRevokeAttempted: true,
      localTokenDeleted: true,
      connectionCleanup: {
        attempted: true,
        deleted: true,
        reason: "deleted"
      },
      connectionDeleted: true
    });
    expect(await tokenVault.getByConnection("conn_4")).toBeNull();
    expect(onDisconnected).toHaveBeenCalledTimes(1);
    expect(onDisconnected).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google",
        connectionId: "conn_4",
        revokeRemote: true,
        requestId: "req_disconnect_1",
        remoteRevokeAttempted: true,
        localTokenDeleted: true,
        subject: {
          kind: "connection",
          tenantId: "tenant_1",
          userId: "user_1",
          connectionId: "conn_4"
        },
        tokenMetadata: expect.objectContaining({
          tenantId: "tenant_1",
          userId: "user_1",
          providerId: "google",
          connectionId: "conn_4",
          keyRef: "oauth-default"
        })
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.disconnect.success",
        details: {
          remoteRevokeAttempted: true,
          localDeleted: true,
          cleanupAttempted: true,
          cleanupDeleted: true,
          cleanupReason: "deleted"
        }
      })
    );
  });

  it("disconnect() accepts legacy hooks that only perform side effects and return void", async () => {
    const { service, tokenVault, events } = createHarness({
      identityHooks: {
        onDisconnected: async () => {}
      }
    });
    await seedConnection(service, "conn_void_hook");

    const result = await service.disconnect({
      connectionId: "conn_void_hook",
      providerId: "google",
      revokeRemote: false,
      requestId: "req_disconnect_void"
    });

    expect(result.connectionCleanup).toEqual({
      attempted: true,
      deleted: false,
      reason: "retained"
    });
    expect(result.connectionDeleted).toBe(false);
    expect(await tokenVault.getByConnection("conn_void_hook")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.disconnect.success",
        requestId: "req_disconnect_void",
        details: {
          remoteRevokeAttempted: false,
          localDeleted: true,
          cleanupAttempted: true,
          cleanupDeleted: false,
          cleanupReason: "retained"
        }
      })
    );
  });

  it("disconnect() surfaces OAUTH_HOOK_FAILED only after local cleanup and emits redaction-safe details", async () => {
    const { service, tokenVault, events } = createHarness({
      identityHooks: {
        onDisconnected: async () => {
          throw new Error("cleanup exploded access-old refresh-old secret_google");
        }
      }
    });
    await seedConnection(service, "conn_5");

    await expect(
      service.disconnect({
        connectionId: "conn_5",
        providerId: "google",
        revokeRemote: false,
        requestId: "req_disconnect_2"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_HOOK_FAILED",
      message: "identity hook failed",
      details: {
        remoteRevokeAttempted: false,
        localDeleted: true,
        cleanupAttempted: true,
        cleanupDeleted: false,
        cleanupReason: "retained"
      }
    });

    expect(await tokenVault.getByConnection("conn_5")).toBeNull();
    const failureEvent = events.find((event) => event.name === "oauth.flow.disconnect.failed");
    expect(failureEvent).toMatchObject({
      requestId: "req_disconnect_2",
      errorCode: "OAUTH_HOOK_FAILED",
      details: {
        remoteRevokeAttempted: false,
        localDeleted: true,
        cleanupAttempted: true,
        cleanupDeleted: false,
        cleanupReason: "retained"
      }
    });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("access-old");
    expect(serializedEvents).not.toContain("refresh-old");
    expect(serializedEvents).not.toContain("secret_google");
    expect(serializedEvents).not.toContain("encryptedPayload");
  });

  it("disconnect() rejects invalid hook cleanup results after local cleanup", async () => {
    const { service, tokenVault, events } = createHarness({
      identityHooks: {
        onDisconnected: async () => ({ deleted: true } as unknown as OAuthFlowConnectionCleanup)
      }
    });
    await seedConnection(service, "conn_6");

    await expect(
      service.disconnect({
        connectionId: "conn_6",
        providerId: "google",
        revokeRemote: false,
        requestId: "req_disconnect_3"
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "disconnect hook returned invalid cleanup result",
      details: {
        remoteRevokeAttempted: false,
        localDeleted: true,
        cleanupAttempted: true,
        cleanupDeleted: false,
        cleanupReason: "retained"
      }
    });

    expect(await tokenVault.getByConnection("conn_6")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.disconnect.failed",
        requestId: "req_disconnect_3",
        errorCode: "VALIDATION_ERROR",
        details: {
          remoteRevokeAttempted: false,
          localDeleted: true,
          cleanupAttempted: true,
          cleanupDeleted: false,
          cleanupReason: "retained"
        }
      })
    );
  });

  it("disconnect() still cleans local records when remote revoke fails", async () => {
    const { service, tokenVault, tokenHttpClient, events } = createHarness();
    await seedConnection(service, "conn_7");

    tokenHttpClient.revokeToken = vi.fn(async () => {
      throw new OAuthHttpError("upstream revoke failed", {
        code: "INTERNAL_ERROR",
        status: 500,
        retryable: false
      });
    });

    await expect(
      service.disconnect({
        connectionId: "conn_7",
        providerId: "google",
        revokeRemote: true
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      details: {
        remoteRevokeAttempted: true,
        localDeleted: true,
        cleanupAttempted: false,
        cleanupDeleted: false,
        cleanupReason: "not-configured"
      }
    });

    expect(await tokenVault.getByConnection("conn_7")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.disconnect.failed",
        details: {
          remoteRevokeAttempted: true,
          localDeleted: true,
          cleanupAttempted: false,
          cleanupDeleted: false,
          cleanupReason: "not-configured"
        }
      })
    );
  });

  it("disconnect() honors tokenTypeHint when choosing which token to revoke", async () => {
    const { service, tokenHttpClient } = createHarness();
    await seedConnection(service, "conn_8");

    await service.disconnect({
      connectionId: "conn_8",
      providerId: "google",
      revokeRemote: true,
      tokenTypeHint: "access_token",
    });

    expect(tokenHttpClient.revokeToken).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "access-old",
        tokenTypeHint: "access_token",
      })
    );
  });
});
