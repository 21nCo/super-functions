import { describe, expect, it } from "vitest";
import type { OAuthProviderDescriptor, OAuthProviderRuntimeConfigResolverInput } from "@superfunctions/oauth-core";
import type { OAuthFlowCallbackResult, OAuthFlowConnectionCleanup, OAuthFlowDisconnectResult } from "../index.js";
import {
  OAuthFlowError,
  createOAuthFlowService,
  invokeIdentityHook
} from "../index.js";

const provider: OAuthProviderDescriptor = {
  id: "mock",
  authorizationUrl: "https://mock.example/auth",
  tokenUrl: "https://mock.example/token",
  revocationUrl: "https://mock.example/revoke",
  defaultScopes: ["read"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

function createTestConfig() {
  return {
    providers: { mock: provider },
    providerRuntimeConfig: {
      mock: {
        clientId: "client_1",
        clientSecret: "secret_1",
        allowlistedRedirectUris: ["https://app.example/callback"]
      }
    },
    tokenStorageMode: "plaintext-unsafe" as const,
    stateStore: {
      async put() {},
      async get() {
        return null;
      },
      async consume() {
        return null;
      },
      async deleteExpired() {
        return 0;
      }
    },
    tokenVault: {
      async put() {},
      async get() {
        return null;
      },
      async getByConnection() {
        return null;
      },
      async rotateKey() {},
      async deleteByConnection() {}
    }
  };
}

describe("oauth-flow exports", () => {
  it("exposes required service API surface", () => {
    const service = createOAuthFlowService(createTestConfig());
    const cleanup: OAuthFlowConnectionCleanup = {
      attempted: false,
      deleted: false,
      reason: "not-configured"
    };
    const disconnectResult: OAuthFlowDisconnectResult = {
      disconnected: true,
      remoteRevokeAttempted: false,
      localTokenDeleted: true,
      connectionCleanup: cleanup,
      connectionDeleted: cleanup.deleted
    };

    expect(typeof service.start).toBe("function");
    expect(typeof service.handleCallback).toBe("function");
    expect(typeof service.refresh).toBe("function");
    expect(typeof service.disconnect).toBe("function");
    expect(disconnectResult.connectionCleanup.reason).toBe("not-configured");
    expect(disconnectResult.connectionDeleted).toBe(false);
  });

  it("invokes identity hooks and wraps hook failures deterministically", async () => {
    const callbackPayload = {
      providerId: "mock",
      subject: {
        kind: "connection" as const,
        tenantId: "tenant_1",
        userId: "user_1",
        connectionId: "conn_1"
      },
      tokenSet: {
        accessToken: "access_1",
        refreshToken: "refresh_1"
      },
      tokenRecordId: "tok_1",
      connectionId: "conn_1"
    } satisfies OAuthFlowCallbackResult;

    let onConnectedCalled = false;
    await invokeIdentityHook(
      {
        async onConnected(result) {
          onConnectedCalled = true;
          expect(result.providerId).toBe("mock");
          expect(result.connectionId).toBe("conn_1");
          expect(result.subject.tenantId).toBe("tenant_1");
          expect(result.subject.userId).toBe("user_1");
          expect(result.tokenSet.refreshToken).toBe("refresh_1");
        }
      },
      "onConnected",
      callbackPayload
    );
    expect(onConnectedCalled).toBe(true);

    await expect(
      invokeIdentityHook(
        {
          async onConnected() {
            throw new Error("boom");
          }
        },
        "onConnected",
        callbackPayload
      )
    ).rejects.toBeInstanceOf(OAuthFlowError);

    await expect(
      invokeIdentityHook(
        {
          async onConnected() {
            throw new Error("boom");
          }
        },
        "onConnected",
        callbackPayload
      )
    ).rejects.toMatchObject({
      code: "OAUTH_HOOK_FAILED",
      message: "identity hook failed"
    });
  });

  it("passes undefined optional resolver fields for disconnect and concrete fields for refresh", async () => {
    const runtimeResolverCalls: OAuthProviderRuntimeConfigResolverInput[] = [];
    const service = createOAuthFlowService({
      providers: { mock: provider },
      resolveProviderRuntimeConfig: async (input) => {
        runtimeResolverCalls.push(input);
        return {
          clientId: "resolver_client_1",
          clientSecret: "resolver_secret_1",
          allowlistedRedirectUris: ["https://app.example/callback"]
        };
      },
      stateStore: {
        async put() {},
        async get() {
          return null;
        },
        async consume() {
          return null;
        },
        async deleteExpired() {
          return 0;
        }
      },
      tokenVault: {
        async put() {},
        async get() {
          return null;
        },
        async getByConnection() {
          return {
            tokenId: "tok_1",
            tenantId: "tenant_1",
            userId: "user_1",
            providerId: "mock",
            connectionId: "conn_1",
            encryptedPayload: JSON.stringify({
              accessToken: "access_1",
              refreshToken: "refresh_1"
            }),
            keyRef: "oauth-default",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          };
        },
        async rotateKey() {},
        async deleteByConnection() {}
      },
      tokenStorageMode: "plaintext-unsafe",
      tokenHttpClient: {
        async exchangeToken() {
          return {
            accessToken: "access_2",
            refreshToken: "refresh_1",
            expiresIn: 3600
          };
        },
        async revokeToken() {}
      }
    });

    await service.refresh({
      connectionId: "conn_1",
      providerId: "mock",
      redirectUri: "https://app.example/callback",
      scopes: ["read"]
    });

    await service.disconnect({
      connectionId: "conn_1",
      providerId: "mock",
      revokeRemote: true
    });

    expect(runtimeResolverCalls).toHaveLength(2);
    expect(runtimeResolverCalls[0]).toMatchObject({
      providerId: "mock",
      subject: {
        kind: "connection",
        tenantId: "tenant_1",
        userId: "user_1",
        connectionId: "conn_1"
      },
      redirectUri: "https://app.example/callback",
      scopes: ["read"]
    });
    expect(runtimeResolverCalls[1]).toMatchObject({
      providerId: "mock",
      subject: {
        kind: "connection",
        tenantId: "tenant_1",
        userId: "user_1",
        connectionId: "conn_1"
      }
    });
    expect(runtimeResolverCalls[1].redirectUri).toBeUndefined();
    expect(runtimeResolverCalls[1].scopes).toBeUndefined();
    expect(runtimeResolverCalls[1].prompt).toBeUndefined();
    expect(runtimeResolverCalls[1].loginHint).toBeUndefined();
  });
});
