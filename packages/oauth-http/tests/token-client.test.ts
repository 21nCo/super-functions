import { describe, expect, it, vi } from "vitest";
import {
  DefaultOAuthTokenHttpClient,
  OAuthHttpError,
  disconnectWithRevoke,
  type OAuthFetchLike,
  type RequestInitLike
} from "../src/index.js";

const googleProvider = {
  id: "google",
  authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revocationUrl: "https://oauth2.googleapis.com/revoke",
  defaultScopes: ["openid", "email", "profile"],
  supportsPkce: true,
  supportsRefreshToken: true,
  scopeSeparator: " ",
  tokenAuthMethod: "client_secret_post" as const
};

describe("oauth-http token client", () => {
  it("serializes token exchange as form-encoded for client_secret_post", async () => {
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (_url, init) => {
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "at_123",
          refresh_token: "rt_123",
          token_type: "bearer",
          expires_in: 3600
        })
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    const response = await client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-123",
      redirectUri: "https://app/callback",
      codeVerifier: "verifier-123",
      scopes: ["scope:a", "scope:b"]
    });

    expect(response.accessToken).toBe("at_123");
    expect(response.refreshToken).toBe("rt_123");
    expect(response.tokenType).toBe("bearer");
    expect(response.expiresIn).toBe(3600);

    expect(capturedInit?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(capturedInit?.body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code-123");
    expect(params.get("redirect_uri")).toBe("https://app/callback");
    expect(params.get("code_verifier")).toBe("verifier-123");
    expect(params.get("scope")).toBe("scope:a scope:b");
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("client_secret")).toBe("client-secret");
  });

  it("supports client_secret_basic and form-like token responses", async () => {
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (_url, init) => {
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/x-www-form-urlencoded",
        body: "access_token=at_form&refresh_token=rt_form&token_type=bearer&expires_in=1200"
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    const response = await client.exchangeToken({
      provider: {
        ...googleProvider,
        tokenAuthMethod: "client_secret_basic"
      },
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-basic",
      redirectUri: "https://app/callback"
    });

    expect(response.accessToken).toBe("at_form");
    expect(response.refreshToken).toBe("rt_form");
    expect(response.expiresIn).toBe(1200);

    expect(capturedInit?.headers.authorization).toMatch(/^Basic /);
    const params = new URLSearchParams(capturedInit?.body);
    expect(params.get("client_id")).toBeNull();
    expect(params.get("client_secret")).toBeNull();
  });

  it("percent-encodes client_secret_basic credentials and redacts token payloads from error details", async () => {
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (_url, init) => {
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          refresh_token: "rt_secret",
          id_token: "id_secret"
        })
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await expect(
      client.exchangeToken({
        provider: {
          ...googleProvider,
          tokenAuthMethod: "client_secret_basic"
        },
        grantType: "authorization_code",
        clientId: "client:id",
        clientSecret: "secret+value",
        code: "code-basic",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      details: {
        parsedBodyKeys: ["refresh_token", "id_token"]
      }
    });

    const encodedCredentials = Buffer.from("client%3Aid:secret%2Bvalue").toString("base64");
    expect(capturedInit?.headers.authorization).toBe(`Basic ${encodedCredentials}`);
  });

  it("resolves client secrets at runtime for Apple-compatible providers", async () => {
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (_url, init) => {
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "at_apple", token_type: "bearer" })
      });
    };

    const clientSecretResolver = vi.fn(async () => ({
      clientSecret: "generated-apple-client-secret"
    }));

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    const response = await client.exchangeToken({
      provider: {
        ...googleProvider,
        id: "apple",
        tokenAuthMethod: "client_secret_post"
      },
      grantType: "authorization_code",
      clientId: "apple-client-id",
      clientSecretResolver,
      code: "apple-code",
      redirectUri: "https://app/callback"
    });

    expect(response.accessToken).toBe("at_apple");
    expect(clientSecretResolver).toHaveBeenCalledTimes(1);
    const params = new URLSearchParams(capturedInit?.body);
    expect(params.get("client_secret")).toBe("generated-apple-client-secret");
  });

  it("fails with OAUTH_SECRET_RESOLUTION_FAILED when runtime secret resolution throws", async () => {
    const fetcher: OAuthFetchLike = async () => {
      throw new Error("should not call fetch");
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecretResolver: async () => {
          throw new Error("kms unavailable");
        },
        code: "code-secret-error",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_SECRET_RESOLUTION_FAILED",
      details: {
        providerId: "google",
        operation: "exchange"
      }
    });
  });

  it("does not leak resolver failure messages into structured error details", async () => {
    const client = new DefaultOAuthTokenHttpClient({
      fetcher: async () => {
        throw new Error("should not call fetch");
      }
    });

    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecretResolver: async () => {
          throw new Error("kms://secret?token=top-secret");
        },
        code: "code-secret-error",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_SECRET_RESOLUTION_FAILED",
      details: {
        providerId: "google",
        operation: "exchange",
        hasResolver: true
      }
    });
  });

  it("fails with OAUTH_RUNTIME_CONFIG_INVALID when no client secret path is configured", async () => {
    const fetcher: OAuthFetchLike = async () => {
      throw new Error("should not call fetch");
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        code: "code-no-secret",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_RUNTIME_CONFIG_INVALID"
    });
  });

  it("rejects unsupported token auth method with deterministic validation error", async () => {
    const fetcher: OAuthFetchLike = async () => {
      throw new Error("should not call fetch");
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await expect(
      client.exchangeToken({
        provider: {
          ...googleProvider,
          tokenAuthMethod: "private_key_jwt" as unknown as "client_secret_post"
        },
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "code-unsupported",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "unsupported token auth method"
    });
  });

  it("retries token exchange using Retry-After hints", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetcher: OAuthFetchLike = async () => {
      calls += 1;
      if (calls === 1) {
        return createResponse({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "rate_limited" }),
          headers: { "retry-after": "7" }
        });
      }

      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "at_after_retry", token_type: "bearer" })
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher, sleep });
    const response = await client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-retry",
      redirectUri: "https://app/callback"
    });

    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(7000);
    expect(response.accessToken).toBe("at_after_retry");
  });

  it("honors server-provided Retry-After delays even when they exceed the local backoff ceiling", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetcher: OAuthFetchLike = async () => {
      calls += 1;
      if (calls === 1) {
        return createResponse({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ error: "rate_limited" }),
          headers: { "retry-after": "120" }
        });
      }

      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "at_after_retry", token_type: "bearer" })
      });
    };

    const client = new DefaultOAuthTokenHttpClient({
      fetcher,
      sleep,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 250,
        maxDelayMs: 5_000,
        jitterRatio: 0,
        random: () => 0
      }
    });

    await client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-retry",
      redirectUri: "https://app/callback"
    });

    expect(sleep).toHaveBeenCalledWith(120_000);
  });

  it("retries transient fetch exceptions during token exchange", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetcher: OAuthFetchLike = async () => {
      calls += 1;
      if (calls === 1) {
        throw new Error("socket hang up");
      }

      return createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "at_after_retry", token_type: "bearer" })
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher, sleep });
    const response = await client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-retry",
      redirectUri: "https://app/callback"
    });

    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(response.accessToken).toBe("at_after_retry");
  });

  it("wraps exhausted fetch exceptions in OAuthHttpError after retry attempts are spent", async () => {
    const sleep = vi.fn(async () => undefined);
    const client = new DefaultOAuthTokenHttpClient({
      fetcher: async () => {
        throw new Error("socket hang up");
      },
      sleep,
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 10,
        maxDelayMs: 10,
        jitterRatio: 0,
        random: () => 0,
      },
    });

    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "code-fail",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      details: {
        transportFailure: true
      }
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("fails deterministically when a JSON token body is malformed", async () => {
    const client = new DefaultOAuthTokenHttpClient({
      fetcher: async () =>
        createResponse({
          status: 200,
          contentType: "application/json",
          body: "{not-json"
        })
    });

    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "code-malformed",
        redirectUri: "https://app/callback"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_EXCHANGE_FAILED",
      message: "OAuth token response body must be a JSON object"
    });
  });

  it("maps refresh endpoint failures to OAUTH_TOKEN_REFRESH_FAILED", async () => {
    const fetcher: OAuthFetchLike = async () =>
      createResponse({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ error: "invalid_grant", error_description: "refresh token expired" })
      });

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await expect(
      client.exchangeToken({
        provider: googleProvider,
        grantType: "refresh_token",
        clientId: "client-id",
        clientSecret: "client-secret",
        refreshToken: "rt_expired"
      })
    ).rejects.toMatchObject({
      code: "OAUTH_TOKEN_REFRESH_FAILED",
      message: "refresh token expired"
    });
  });

  it("calls provider revocation endpoint when supported", async () => {
    const calledUrls: string[] = [];
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (url, init) => {
      calledUrls.push(url);
      capturedInit = init;
      return createResponse({
        status: 200,
        contentType: "application/json",
        body: "{}"
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await client.revokeToken({
      provider: googleProvider,
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "token-to-revoke",
      tokenTypeHint: "access_token"
    });

    expect(calledUrls).toEqual([googleProvider.revocationUrl]);
    const body = new URLSearchParams(capturedInit?.body);
    expect(body.get("token")).toBe("token-to-revoke");
    expect(body.get("token_type_hint")).toBe("access_token");
  });

  it("skips remote revoke when provider has no revocation URL", async () => {
    const fetcher = vi.fn(async () =>
      createResponse({
        status: 200,
        contentType: "application/json",
        body: "{}"
      })
    );

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await client.revokeToken({
      provider: {
        ...googleProvider,
        revocationUrl: undefined
      },
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "token-to-revoke"
    });

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("attempts remote revoke and always performs local cleanup on failure", async () => {
    const failingClient = {
      async exchangeToken() {
        throw new Error("not implemented");
      },
      async revokeToken() {
        throw new OAuthHttpError("provider revoke failed", {
          code: "INTERNAL_ERROR",
          status: 502
        });
      }
    };

    const deleteLocalTokenRecord = vi.fn(async () => undefined);
    const deleteConnectionRecord = vi.fn(async () => undefined);
    const onRevocationFailure = vi.fn(async () => undefined);

    await expect(
      disconnectWithRevoke(failingClient, {
        revokeSupported: true,
        revokeRequest: {
          provider: googleProvider,
          clientId: "client-id",
          clientSecret: "client-secret",
          token: "at_123"
        },
        deleteLocalTokenRecord,
        deleteConnectionRecord,
        onRevocationFailure
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      details: {
        remoteRevokeAttempted: true,
        localTokenDeleted: true,
        connectionDeleted: true
      }
    });

    expect(deleteLocalTokenRecord).toHaveBeenCalledTimes(1);
    expect(deleteConnectionRecord).toHaveBeenCalledTimes(1);
    expect(onRevocationFailure).toHaveBeenCalledTimes(1);
  });

  it("attempts remote revoke and returns cleanup result on success", async () => {
    const successfulClient = {
      async exchangeToken() {
        throw new Error("not implemented");
      },
      async revokeToken() {
        return;
      }
    };

    const deleteLocalTokenRecord = vi.fn(async () => undefined);
    const deleteConnectionRecord = vi.fn(async () => undefined);

    const result = await disconnectWithRevoke(successfulClient, {
      revokeSupported: true,
      revokeRequest: {
        provider: googleProvider,
        clientId: "client-id",
        clientSecret: "client-secret",
        token: "at_123"
      },
      deleteLocalTokenRecord,
      deleteConnectionRecord
    });

    expect(result).toEqual({
      remoteRevokeAttempted: true,
      localTokenDeleted: true,
      connectionDeleted: true
    });
    expect(deleteLocalTokenRecord).toHaveBeenCalledTimes(1);
    expect(deleteConnectionRecord).toHaveBeenCalledTimes(1);
  });
});

function createResponse(input: {
  status: number;
  contentType: string;
  body: string;
  headers?: Record<string, string>;
}) {
  const headerMap = new Map<string, string>();
  headerMap.set("content-type", input.contentType);
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headerMap.set(key.toLowerCase(), value);
  }

  return {
    ok: input.status >= 200 && input.status <= 299,
    status: input.status,
    headers: {
      get(name: string) {
        return headerMap.get(name.toLowerCase()) ?? null;
      }
    },
    async text() {
      return input.body;
    }
  };
}
