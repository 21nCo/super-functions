import { describe, expect, it, vi } from "vitest";
import { cloneOAuthStateRecord, type OAuthStateRecord } from "@superfunctions/oauth-storage";
import { DefaultOAuthService, redactOAuthValue } from "../src/index.js";

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
        responseType: "code id_token",
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

  it("honors provider-specific response_type values", async () => {
    const { service } = createService();
    const result = await service.createAuthorizationRequest({
      providerId: "microsoft",
      tenantId: "t1",
      userId: "u1",
      connectionId: "conn_1",
      redirectUri: "https://app/callback"
    });

    const authorizationUrl = new URL(result.authorizationUrl);
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code id_token");
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

describe("OAuth diagnostic redaction", () => {
  it("redacts complete quoted and delimiter-bearing credential values", () => {
    expect(
      redactOAuthValue(
        'password="correct horse battery staple", client_secret="abc&def", token=abc&def',
      ),
    ).toBe(
      'password="[REDACTED]", client_secret="[REDACTED]", token=[REDACTED]',
    );
  });

  it("redacts quoted credentials containing escaped matching quotes", () => {
    const value = String.raw`password="prefix\"suffix", client_secret='left\'right'`;
    const redacted = redactOAuthValue(value);

    expect(redacted).toBe(
      'password="[REDACTED]", client_secret=\'[REDACTED]\'',
    );
    expect(redacted).not.toContain("prefix");
    expect(redacted).not.toContain("suffix");
    expect(redacted).not.toContain("left");
    expect(redacted).not.toContain("right");
  });

  it("redacts complete unquoted credentials across punctuation delimiters", () => {
    expect(
      redactOAuthValue("client_secret=abc,def; visible=yes; password=abc;def"),
    ).toBe("client_secret=[REDACTED]; visible=yes; password=[REDACTED]");
  });

  it("redacts unterminated quoted credentials through the end of the line", () => {
    const doubleQuoted = redactOAuthValue('password="secret suffix');
    const singleQuoted = redactOAuthValue("client_secret='left right");

    expect(doubleQuoted).toBe('password="[REDACTED]"');
    expect(singleQuoted).toBe("client_secret='[REDACTED]'");
    expect(doubleQuoted).not.toContain("suffix");
    expect(singleQuoted).not.toContain("right");
  });

  it("stops iterating Maps and Sets at the configured entry cap", () => {
    let mapClosed = false;
    let setClosed = false;
    class GuardedMap extends Map<unknown, unknown> {
      override get size(): number { return 1_000; }
      override *entries(): MapIterator<[unknown, unknown]> {
        try {
          yield ["first", 1];
          yield ["second", 2];
          throw new Error("Map iteration exceeded the cap");
        } finally {
          mapClosed = true;
        }
      }
      override [Symbol.iterator](): MapIterator<[unknown, unknown]> {
        return this.entries();
      }
    }
    class GuardedSet extends Set<unknown> {
      override get size(): number { return 1_000; }
      override *values(): SetIterator<unknown> {
        try {
          yield "first";
          yield "second";
          throw new Error("Set iteration exceeded the cap");
        } finally {
          setClosed = true;
        }
      }
      override [Symbol.iterator](): SetIterator<unknown> {
        return this.values();
      }
    }

    expect(redactOAuthValue(new GuardedMap(), { maxArrayEntries: 2 })).toEqual({
      type: "Map",
      entries: [["first", 1], ["second", 2], ["[TRUNCATED]", "[TRUNCATED]"]],
    });
    expect(redactOAuthValue(new GuardedSet(), { maxArrayEntries: 2 })).toEqual({
      type: "Set",
      values: ["first", "second", "[TRUNCATED]"],
    });
    expect(mapClosed).toBe(true);
    expect(setClosed).toBe(true);
  });

  it("normalizes fractional collection caps and avoids zero-cap iterators", () => {
    class NoIterationMap extends Map<unknown, unknown> {
      override get size(): number { return 1; }
      override [Symbol.iterator](): MapIterator<[unknown, unknown]> {
        throw new Error("zero cap created a Map iterator");
      }
    }
    class NoIterationSet extends Set<unknown> {
      override get size(): number { return 1; }
      override [Symbol.iterator](): SetIterator<unknown> {
        throw new Error("zero cap created a Set iterator");
      }
    }

    expect(redactOAuthValue(new Map([["first", 1], ["second", 2]]), {
      maxArrayEntries: 1.9,
    })).toEqual({
      type: "Map",
      entries: [["first", 1], ["[TRUNCATED]", "[TRUNCATED]"]],
    });
    expect(redactOAuthValue(new Set(["first", "second"]), {
      maxArrayEntries: 1.9,
    })).toEqual({ type: "Set", values: ["first", "[TRUNCATED]"] });
    expect(redactOAuthValue(new NoIterationMap(), { maxArrayEntries: 0 })).toEqual({
      type: "Map",
      entries: [["[TRUNCATED]", "[TRUNCATED]"]],
    });
    expect(redactOAuthValue(new NoIterationSet(), { maxArrayEntries: 0 })).toEqual({
      type: "Set",
      values: ["[TRUNCATED]"],
    });
  });
});
