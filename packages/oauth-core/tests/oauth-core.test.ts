import { describe, expect, it, vi } from "vitest";
import { cloneOAuthStateRecord, type OAuthStateRecord } from "@superfunctions/oauth-storage";
import { DefaultOAuthService } from "../src/index.js";

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
    if (!record || record.consumedAt) {
      return null;
    }

    if (Date.parse(record.expiresAt) <= Date.parse(consumedAt)) {
      return null;
    }

    const consumed = cloneOAuthStateRecord({ ...record, consumedAt });
    this.records.set(stateId, consumed);
    return cloneOAuthStateRecord(consumed);
  }

  async deleteExpired(before: string): Promise<number> {
    const limit = Date.parse(before);
    let deleted = 0;

    for (const [key, value] of this.records.entries()) {
      if (Date.parse(value.expiresAt) < limit) {
        this.records.delete(key);
        deleted += 1;
      }
    }

    return deleted;
  }
}

function createService(overrides?: { now?: () => Date; stateTtlMs?: number }) {
  const stateStore = new TestStateStore();
  const exchangeCodeForToken = vi.fn(async () => ({
    accessToken: "at_valid",
    refreshToken: "rt_valid",
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
      },
      microsoft: {
        id: "microsoft",
        authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        defaultScopes: ["openid", "email", "profile"],
        supportsPkce: true,
        supportsRefreshToken: true,
        scopeSeparator: " "
      }
    },
    providerRuntimeConfig: {
      google: {
        clientId: "google-client-id",
        allowlistedRedirectUris: ["https://app/callback"]
      },
      microsoft: {
        clientId: "microsoft-client-id",
        allowlistedRedirectUris: ["https://app/callback"]
      }
    },
    stateStore,
    exchangeCodeForToken,
    stateTtlMs: overrides?.stateTtlMs,
    now: overrides?.now
  });

  return { service, stateStore, exchangeCodeForToken };
}

describe("oauth-core service", () => {
  it("creates authorization URL with state and PKCE parameters for connection subjects", async () => {
    const { service, stateStore } = createService();
    const result = await service.createAuthorizationRequest({
      providerId: "google",
      tenantId: "t1",
      userId: "u1",
      connectionId: "conn_1",
      redirectUri: "https://app/callback"
    });

    expect(result.stateId).toMatch(/^st_/);

    const authorizationUrl = new URL(result.authorizationUrl);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("google-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://app/callback");
    expect(authorizationUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(authorizationUrl.searchParams.get("state")).toBe(result.stateId);
    expect(authorizationUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("nonce")).toMatch(/^nonce_/);

    const stored = await stateStore.get(result.stateId);
    expect(stored?.subject).toMatchObject({
      kind: "connection",
      tenantId: "t1",
      userId: "u1",
      connectionId: "conn_1"
    });
    expect(stored?.codeVerifier).toBeTruthy();
  });

  it("generates unique high-entropy state values across requests", async () => {
    const { service } = createService();
    const stateIds = new Set<string>();

    for (let index = 0; index < 32; index += 1) {
      const result = await service.createAuthorizationRequest({
        providerId: "google",
        tenantId: "t1",
        userId: `u${index}`,
        redirectUri: "https://app/callback"
      });

      stateIds.add(result.stateId);
      expect(result.stateId.length).toBeGreaterThanOrEqual(20);
    }

    expect(stateIds.size).toBe(32);
  });

  it("rejects non-allowlisted redirect URI during auth URL creation", async () => {
    const { service } = createService();

    await expect(
      service.createAuthorizationRequest({
        providerId: "google",
        tenantId: "t1",
        userId: "u1",
        redirectUri: "https://evil.example/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_REDIRECT_DISALLOWED",
      message: "redirect URI not allowed"
    });
  });

  it("consumes callback state once and blocks replay", async () => {
    const { service, exchangeCodeForToken } = createService();
    const auth = await service.createAuthorizationRequest({
      providerId: "google",
      tenantId: "t1",
      userId: "u1",
      redirectUri: "https://app/callback"
    });

    const first = await service.handleCallback({
      providerId: "google",
      code: "valid-code",
      state: auth.stateId,
      redirectUri: "https://app/callback"
    });

    expect(first.accessToken).toBe("at_valid");
    expect(exchangeCodeForToken).toHaveBeenCalledTimes(1);

    await expect(
      service.handleCallback({
        providerId: "google",
        code: "valid-code",
        state: auth.stateId,
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_STATE_REPLAYED",
      message: "OAuth state already consumed"
    });
  });

  it("rejects callback with provider mismatch", async () => {
    const { service } = createService();
    const auth = await service.createAuthorizationRequest({
      providerId: "google",
      tenantId: "t1",
      userId: "u1",
      redirectUri: "https://app/callback"
    });

    await expect(
      service.handleCallback({
        providerId: "microsoft",
        code: "valid-code",
        state: auth.stateId,
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_CALLBACK_MISMATCH",
      message: "provider mismatch for OAuth callback"
    });
  });

  it("rejects callback with redirect URI mismatch", async () => {
    const { service } = createService();
    const auth = await service.createAuthorizationRequest({
      providerId: "google",
      tenantId: "t1",
      userId: "u1",
      redirectUri: "https://app/callback"
    });

    await expect(
      service.handleCallback({
        providerId: "google",
        code: "valid-code",
        state: auth.stateId,
        redirectUri: "https://app/other"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_CALLBACK_MISMATCH",
      message: "redirect URI not allowed"
    });
  });

  it("rejects expired callback states", async () => {
    let now = new Date("2026-01-01T00:00:00.000Z");
    const { service } = createService({
      now: () => new Date(now),
      stateTtlMs: 60_000
    });

    const auth = await service.createAuthorizationRequest({
      providerId: "google",
      tenantId: "t1",
      userId: "u1",
      redirectUri: "https://app/callback"
    });

    now = new Date("2026-01-01T00:02:00.000Z");

    await expect(
      service.handleCallback({
        providerId: "google",
        code: "valid-code",
        state: auth.stateId,
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_STATE_INVALID",
      message: "OAuth state is invalid or expired"
    });
  });
});
