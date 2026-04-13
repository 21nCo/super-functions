import { describe, expect, it, vi } from "vitest";
import type { OAuthProviderDescriptor, OAuthProviderRuntimeConfigResolverInput } from "@superfunctions/oauth-core";
import { MemoryOAuthStateStore, MemoryTokenVault } from "@superfunctions/oauth-storage";
import { createOAuthFlowService, type OAuthFlowEvent } from "../index.js";

const provider: OAuthProviderDescriptor = {
  id: "google",
  authorizationUrl: "https://accounts.google.example/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.example/token",
  defaultScopes: ["openid", "email"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post"
};

class CountingStateStore extends MemoryOAuthStateStore {
  putCount = 0;

  override async put(record: Parameters<MemoryOAuthStateStore["put"]>[0]): Promise<void> {
    this.putCount += 1;
    await super.put(record);
  }
}

function createHarness(options?: {
  startAt?: string;
  tokenStorageMode?: "encrypted-required" | "plaintext-unsafe";
  omitTokenStorageMode?: boolean;
  providerRuntimeConfig?: {
    google?: {
      clientId?: string;
      clientSecret?: string;
      allowlistedRedirectUris?: string[];
    };
  };
  resolveProviderRuntimeConfig?: (
    input: OAuthProviderRuntimeConfigResolverInput
  ) => Promise<{ clientId: string; clientSecret?: string; allowlistedRedirectUris?: string[] }> | { clientId: string; clientSecret?: string; allowlistedRedirectUris?: string[] };
}) {
  const startAt = options?.startAt ?? "2026-01-01T00:00:00.000Z";
  let nowMs = Date.parse(startAt);
  const now = () => new Date(nowMs);
  const advanceMs = (ms: number) => {
    nowMs += ms;
  };

  const events: OAuthFlowEvent[] = [];
  const stateStore = new CountingStateStore();
  const tokenVault = new MemoryTokenVault();

  const tokenHttpClient = {
    exchangeToken: vi.fn(async () => ({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresIn: 3600,
      tokenType: "Bearer",
      scope: "openid email"
    })),
    revokeToken: vi.fn(async () => {})
  };

  const service = createOAuthFlowService({
    providers: { google: provider },
    providerRuntimeConfig: {
      google: {
        clientId: "client_google",
        clientSecret: "secret_google",
        allowlistedRedirectUris: ["https://app.example/callback"],
        ...options?.providerRuntimeConfig?.google
      }
    },
    resolveProviderRuntimeConfig: options?.resolveProviderRuntimeConfig,
    stateStore,
    tokenVault,
    ...(options?.omitTokenStorageMode
      ? {}
      : {
          tokenStorageMode: options?.tokenStorageMode ?? "plaintext-unsafe"
        }),
    tokenHttpClient,
    now,
    emitEvent: (event) => events.push(event)
  });

  return { service, stateStore, tokenVault, events, tokenHttpClient, advanceMs };
}

describe("oauth-flow start/callback invariants", () => {
  it("start() validates input, persists state, includes PKCE, and emits started event", async () => {
    const { service, stateStore, events } = createHarness();

    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      redirectUri: "https://app.example/callback",
      metadata: { requestId: "req_start_1" }
    });

    expect(started.providerId).toBe("google");
    expect(started.authorizationUrl).toContain("state=");
    expect(started.authorizationUrl).toContain("code_challenge=");
    expect(started.authorizationUrl).toContain("code_challenge_method=S256");

    const url = new URL(started.authorizationUrl);
    expect(url.searchParams.get("state")).toBe(started.stateId);
    expect(url.searchParams.get("client_id")).toBe("client_google");

    const state = await stateStore.get(started.stateId);
    expect(state?.tenantId).toBe("tenant_1");
    expect(state?.userId).toBe("user_1");
    expect(state?.providerId).toBe("google");
    expect(state?.expiresAt).toBeDefined();
    expect(state?.subject).toMatchObject({
      kind: "connection",
      tenantId: "tenant_1",
      userId: "user_1"
    });

    expect(events).toContainEqual(
      expect.objectContaining({
        name: "oauth.flow.started",
        requestId: "req_start_1",
        providerId: "google",
        at: "2026-01-01T00:00:00.000Z",
        ok: true,
        subjectKind: "connection"
      })
    );
  });

  it("start() rejects non-allowlisted redirect before state creation", async () => {
    const { service, stateStore } = createHarness();

    await expect(
      service.start({
        providerId: "google",
        tenantId: "tenant_1",
        userId: "user_1",
        redirectUri: "https://evil.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_REDIRECT_DISALLOWED",
      status: 400,
      retryable: false
    });

    expect(stateStore.putCount).toBe(0);
  });

  it("start() rejects unknown providers with deterministic validation error", async () => {
    const { service } = createHarness();

    await expect(
      service.start({
        providerId: "unknown-provider",
        tenantId: "tenant_1",
        userId: "user_1",
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_PROVIDER_UNSUPPORTED",
      status: 400,
      retryable: false
    });
  });

  it("start() prefers resolver-based runtime config over static config", async () => {
    const resolveProviderRuntimeConfig = vi.fn(async ({ redirectUri }: OAuthProviderRuntimeConfigResolverInput) => ({
      clientId: redirectUri === "https://app.example/callback" ? "resolver_client_google" : "fallback_client",
      clientSecret: "resolver_secret_google",
      allowlistedRedirectUris: ["https://app.example/callback"]
    }));
    const { service } = createHarness({
      providerRuntimeConfig: {
        google: {
          clientId: "static_client_google",
          clientSecret: "static_secret_google",
          allowlistedRedirectUris: ["https://app.example/callback"]
        }
      },
      resolveProviderRuntimeConfig
    });

    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      redirectUri: "https://app.example/callback"
    });

    expect(resolveProviderRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(new URL(started.authorizationUrl).searchParams.get("client_id")).toBe("resolver_client_google");
  });

  it("start() fails with OAUTH_RUNTIME_CONFIG_INVALID when resolver omits clientId", async () => {
    const { service } = createHarness({
      resolveProviderRuntimeConfig: vi.fn(async () => ({
        clientId: "",
        allowlistedRedirectUris: ["https://app.example/callback"]
      }))
    });

    await expect(
      service.start({
        providerId: "google",
        tenantId: "tenant_1",
        userId: "user_1",
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_RUNTIME_CONFIG_INVALID",
      status: 500,
      retryable: false
    });
  });

  it("handleCallback() succeeds once, persists token, and rejects replay deterministically", async () => {
    const { service, stateStore, tokenVault, events } = createHarness();

    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      redirectUri: "https://app.example/callback"
    });

    const first = await service.handleCallback({
      code: "auth-code-1",
      state: started.stateId,
      redirectUri: "https://app.example/callback"
    });

    expect(first.providerId).toBe("google");
    expect(first.subject.kind).toBe("connection");
    expect(first.subject.tenantId).toBe("tenant_1");
    expect(first.subject.userId).toBe("user_1");
    expect(first.tokenSet.accessToken).toBe("access-token");

    const persistedToken = await tokenVault.get(first.tokenRecordId);
    expect(persistedToken?.connectionId).toBe(first.connectionId);
    expect(persistedToken?.providerId).toBe("google");

    const consumedState = await stateStore.get(started.stateId);
    expect(consumedState?.consumedAt).toBeDefined();

    expect(events.some((event) => event.name === "oauth.flow.callback.success")).toBe(true);

    await expect(
      service.handleCallback({
        code: "auth-code-2",
        state: started.stateId,
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_STATE_REPLAYED",
      status: 400,
      retryable: false
    });
  });

  it("handleCallback() keeps legacy plaintext vaults working when tokenStorageMode is omitted", async () => {
    const { service, tokenVault } = createHarness({
      omitTokenStorageMode: true
    });

    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      connectionId: "conn_legacy_plaintext",
      redirectUri: "https://app.example/callback"
    });

    const connected = await service.handleCallback({
      code: "auth-code",
      state: started.stateId,
      redirectUri: "https://app.example/callback"
    });

    expect(connected.connectionId).toBe("conn_legacy_plaintext");
    await expect(tokenVault.getByConnection("conn_legacy_plaintext")).resolves.toMatchObject({
      providerId: "google",
      connectionId: "conn_legacy_plaintext"
    });
  });

  it("handleCallback() rejects plaintext persistence by default and emits redaction-safe failure details", async () => {
    const { service, tokenVault, events } = createHarness({
      tokenStorageMode: "encrypted-required"
    });

    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      connectionId: "conn_unsafe_default",
      redirectUri: "https://app.example/callback"
    });

    await expect(
      service.handleCallback({
        code: "auth-code-unsafe",
        state: started.stateId,
        redirectUri: "https://app.example/callback",
        requestId: "req_unsafe_callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_STORAGE_UNSAFE",
      message: "encrypted token storage is required unless plaintext-unsafe mode is explicitly enabled",
      status: 500,
      retryable: false
    });

    expect(await tokenVault.getByConnection("conn_unsafe_default")).toBeNull();

    const failureEvent = events.find((event) => event.name === "oauth.flow.callback.failed");
    expect(failureEvent).toMatchObject({
      providerId: "google",
      requestId: "req_unsafe_callback",
      errorCode: "OAUTH_TOKEN_STORAGE_UNSAFE"
    });
    expect(failureEvent?.details).toMatchObject({
      operation: "handleCallback",
      providerId: "google",
      connectionId: "conn_unsafe_default",
      storageMode: "encrypted-required",
      vaultKind: "plaintext"
    });

    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents).not.toContain("access-token");
    expect(serializedEvents).not.toContain("refresh-token");
    expect(serializedEvents).not.toContain("secret_google");
    expect(serializedEvents).not.toContain("encryptedPayload");
  });

  it("handleCallback() rejects callback mismatch with deterministic code", async () => {
    const { service } = createHarness();
    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      redirectUri: "https://app.example/callback"
    });

    await expect(
      service.handleCallback({
        code: "auth-code-1",
        state: started.stateId,
        redirectUri: "https://evil.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_CALLBACK_MISMATCH",
      status: 400,
      retryable: false
    });
  });

  it("handleCallback() rejects expired state with deterministic code", async () => {
    const { service, advanceMs } = createHarness();
    const started = await service.start({
      providerId: "google",
      tenantId: "tenant_1",
      userId: "user_1",
      redirectUri: "https://app.example/callback"
    });

    advanceMs(11 * 60 * 1000);

    await expect(
      service.handleCallback({
        code: "auth-code-expired",
        state: started.stateId,
        redirectUri: "https://app.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_STATE_INVALID",
      status: 400,
      retryable: false
    });
  });
});
