import { describe, expect, it, vi } from "vitest";
import { cloneOAuthStateRecord, type OAuthStateRecord } from "@superfunctions/oauth-storage";
import { DefaultOAuthService, type OAuthProviderRuntimeConfigResolverInput } from "../index.js";

class TestStateStore {
  private readonly records = new Map<string, OAuthStateRecord>();

  async put(record: OAuthStateRecord): Promise<void> {
    this.records.set(record.stateId, cloneOAuthStateRecord(record));
  }

  async get(stateId: string): Promise<OAuthStateRecord | null> {
    const record = this.records.get(stateId);
    return record ? cloneOAuthStateRecord(record) : null;
  }

  async consume(stateId: string, consumedAt: string): Promise<OAuthStateRecord | null> {
    const record = this.records.get(stateId);
    if (!record || record.consumedAt || Date.parse(record.expiresAt) <= Date.parse(consumedAt)) {
      return null;
    }

    const consumed = cloneOAuthStateRecord({ ...record, consumedAt });
    this.records.set(stateId, consumed);
    return cloneOAuthStateRecord(consumed);
  }

  async deleteExpired(before: string): Promise<number> {
    const limit = Date.parse(before);
    let deleted = 0;
    for (const [stateId, record] of this.records.entries()) {
      if (Date.parse(record.expiresAt) < limit) {
        this.records.delete(stateId);
        deleted += 1;
      }
    }

    return deleted;
  }
}

function createBrowserAuthService(
  resolveProviderRuntimeConfig?: (input: OAuthProviderRuntimeConfigResolverInput) => Promise<{ clientId: string; allowlistedRedirectUris?: string[] }>
) {
  const stateStore = new TestStateStore();
  const exchangeCodeForToken = vi.fn(async () => ({
    accessToken: "at_browser",
    tokenType: "bearer"
  }));

  const service = new DefaultOAuthService({
    providers: {
      google: {
        id: "google",
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        defaultScopes: ["openid", "email", "profile"],
        supportsPkce: true,
        supportsRefreshToken: true,
        scopeSeparator: " "
      }
    },
    resolveProviderRuntimeConfig,
    providerRuntimeConfig: {
      google: {
        clientId: "fallback-client-id",
        allowlistedRedirectUris: ["https://app/callback"]
      }
    },
    stateStore,
    exchangeCodeForToken
  });

  return { service, stateStore, exchangeCodeForToken };
}

describe("oauth-core browser-auth intents", () => {
  it("creates authorization requests without a pre-existing user and persists browser-auth subject details", async () => {
    const { service, stateStore } = createBrowserAuthService();

    const result = await service.createAuthorizationRequest({
      providerId: "google",
      redirectUri: "https://app/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_01",
        tenantId: "tenant_optional",
        regionId: "eu-west-1",
        returnTo: "https://app.example/post-auth",
        metadata: { source: "signin" }
      }
    });

    const stored = await stateStore.get(result.stateId);
    expect(stored?.subject).toMatchObject({
      kind: "browser-auth",
      intentId: "intent_01",
      tenantId: "tenant_optional",
      regionId: "eu-west-1",
      returnTo: "https://app.example/post-auth",
      metadata: { source: "signin" }
    });
    expect(stored?.userId).toBeUndefined();
    expect(new URL(result.authorizationUrl).searchParams.get("client_id")).toBe("fallback-client-id");
  });

  it("supports resolver-based runtime config for browser-auth requests", async () => {
    const resolveProviderRuntimeConfig = vi.fn(async ({ subject }: OAuthProviderRuntimeConfigResolverInput) => ({
      clientId: subject.kind === "browser-auth" && subject.regionId === "eu-west-1" ? "eu-client-id" : "default-client-id",
      allowlistedRedirectUris: ["https://app/callback"]
    }));
    const { service } = createBrowserAuthService(resolveProviderRuntimeConfig);

    const result = await service.createAuthorizationRequest({
      providerId: "google",
      redirectUri: "https://app/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_02",
        regionId: "eu-west-1"
      }
    });

    expect(resolveProviderRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(new URL(result.authorizationUrl).searchParams.get("client_id")).toBe("eu-client-id");
  });

  it("reconstructs browser-auth subject details during callback exchange", async () => {
    const { service, exchangeCodeForToken } = createBrowserAuthService();

    const result = await service.createAuthorizationRequest({
      providerId: "google",
      redirectUri: "https://app/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_04",
        tenantId: "tenant_1",
        regionId: "eu-west-1",
        returnTo: "https://app.example/post-auth",
        metadata: { source: "signup" }
      }
    });

    await service.handleCallback({
      providerId: "google",
      code: "code_123",
      state: result.stateId,
      redirectUri: "https://app/callback"
    });

    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);
    expect(exchangeCodeForToken.mock.calls[0]?.[0]).toMatchObject({
      code: "code_123",
      redirectUri: "https://app/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_04",
        tenantId: "tenant_1",
        regionId: "eu-west-1",
        returnTo: "https://app.example/post-auth",
        metadata: { source: "signup" }
      }
    });
  });

  it("fails with canonical provider errors for unsupported providers", async () => {
    const { service } = createBrowserAuthService();

    await expect(
      service.createAuthorizationRequest({
        providerId: "github",
        redirectUri: "https://app/callback",
        subject: {
          kind: "browser-auth",
          intentId: "intent_03"
        }
      })
    ).rejects.toMatchObject({
      code: "OAUTH_PROVIDER_UNSUPPORTED"
    });
  });
});
