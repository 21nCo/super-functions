import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("does not replay an authorization-code exchange after response headers arrive", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetcher: OAuthFetchLike = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => {
          throw new Error("response body disconnected");
        }
      };
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher, sleep });
    await expect(client.exchangeToken({
        provider: googleProvider,
        grantType: "authorization_code",
        clientId: "client-id",
        clientSecret: "client-secret",
        code: "code-body-failure",
        redirectUri: "https://app/callback"
      })).rejects.toMatchObject({
        code: "OAUTH_TOKEN_EXCHANGE_FAILED",
        retryable: false,
        details: {
          transportFailure: true,
          responseBodyFailure: true
        }
      });

    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("classifies a refresh response-body failure without replaying the request", async () => {
    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const fetcher: OAuthFetchLike = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => {
          throw new Error("response body disconnected");
        }
      };
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher, sleep });
    await expect(client.exchangeToken({
      provider: googleProvider,
      grantType: "refresh_token",
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-body-failure"
    })).rejects.toMatchObject({
      code: "OAUTH_TOKEN_REFRESH_FAILED",
      retryable: false,
      details: {
        transportFailure: true,
        responseBodyFailure: true
      }
    });

    expect(calls).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("preserves prototype-backed fields when a custom fetcher returns Response", async () => {
    const client = new DefaultOAuthTokenHttpClient({
      fetcher: async () => new Response(
        JSON.stringify({ access_token: "at_native", token_type: "bearer" }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    });

    const response = await client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-native-response",
      redirectUri: "https://app/callback"
    });

    expect(response.accessToken).toBe("at_native");
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

  it.each([
    ["authorization_code", "OAUTH_TOKEN_EXCHANGE_FAILED"],
    ["refresh_token", "OAUTH_TOKEN_REFRESH_FAILED"],
  ] as const)("rejects negative expires_in values for %s", async (grantType, code) => {
    const client = new DefaultOAuthTokenHttpClient({
      fetcher: async () => createResponse({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ access_token: "at_invalid", expires_in: -1 })
      })
    });

    await expect(client.exchangeToken({
      provider: googleProvider,
      grantType,
      clientId: "client-id",
      clientSecret: "client-secret",
      ...(grantType === "authorization_code"
        ? { code: "code-invalid", redirectUri: "https://app/callback" }
        : { refreshToken: "rt_invalid" })
    })).rejects.toMatchObject({
      code,
      status: 502,
      details: { invalidField: "expires_in" }
    });
  });

  it("keeps the timeout active while consuming the provider response body", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => new Promise<string>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    })));
    const client = new DefaultOAuthTokenHttpClient({
      timeoutMs: 5,
      retryPolicy: {
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        jitterRatio: 0,
        random: () => 0
      }
    });

    await expect(client.exchangeToken({
      provider: googleProvider,
      grantType: "authorization_code",
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "code-timeout",
      redirectUri: "https://app/callback"
    })).rejects.toMatchObject({ status: 504, retryable: false });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid default-fetch timeout configuration: %s",
    (timeoutMs) => {
      expect(() => new DefaultOAuthTokenHttpClient({ timeoutMs })).toThrow(
        expect.objectContaining({ code: "VALIDATION_ERROR", status: 400 })
      );
    }
  );

  it("does not wait for a successful revocation response body", async () => {
    const cancel = vi.fn(async () => undefined);
    const text = vi.fn(() => new Promise<string>(() => undefined));
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { cancel },
      text,
    })));
    const client = new DefaultOAuthTokenHttpClient({ timeoutMs: 50 });

    await client.revokeToken({
      provider: googleProvider,
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "token-to-revoke",
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(text).not.toHaveBeenCalled();
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

  it("uses GitHub application token revocation semantics", async () => {
    const githubProvider = {
      id: "github",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      revocationUrl: "https://api.github.com/applications/{client_id}/token",
      defaultScopes: ["read:user"],
      supportsPkce: true,
      supportsRefreshToken: false,
      tokenAuthMethod: "client_secret_post" as const
    };
    const calledUrls: string[] = [];
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (url, init) => {
      calledUrls.push(url);
      capturedInit = init;
      return createResponse({
        status: 204,
        contentType: "application/json",
        body: ""
      });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await client.revokeToken({
      provider: githubProvider,
      clientId: "gh-client-id",
      clientSecret: "gh-client-secret",
      token: "gh-access-token",
      tokenTypeHint: "access_token"
    });

    expect(calledUrls).toEqual(["https://api.github.com/applications/gh-client-id/token"]);
    expect(capturedInit?.method).toBe("DELETE");
    const encodedCredentials = Buffer.from("gh-client-id:gh-client-secret").toString("base64");
    expect(capturedInit?.headers?.authorization).toBe(`Basic ${encodedCredentials}`);
    expect(JSON.parse(String(capturedInit?.body))).toEqual({ access_token: "gh-access-token" });
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

  it("revokes RFC 7009 tokens via form-encoded POST", async () => {
    let capturedUrl: string | null = null;
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return createResponse({ status: 200, contentType: "application/json", body: "{}" });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await client.revokeToken({
      provider: googleProvider,
      clientId: "client-id",
      clientSecret: "client-secret",
      token: "tok_123",
      tokenTypeHint: "access_token"
    });

    expect(capturedUrl).toBe("https://oauth2.googleapis.com/revoke");
    expect(capturedInit?.method).toBe("POST");
    expect(capturedInit?.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const params = new URLSearchParams(capturedInit?.body);
    expect(params.get("token")).toBe("tok_123");
    expect(params.get("token_type_hint")).toBe("access_token");
  });

  it("revokes GitHub tokens via DELETE with a JSON body, Basic auth and substituted client_id", async () => {
    const githubProvider = {
      id: "github",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      revocationUrl: "https://api.github.com/applications/{client_id}/token",
      revocationStyle: "github" as const,
      defaultScopes: ["read:user"],
      supportsPkce: true,
      supportsRefreshToken: false,
      scopeSeparator: " " as const,
      tokenAuthMethod: "client_secret_post" as const
    };

    let capturedUrl: string | null = null;
    let capturedInit: RequestInitLike | null = null;
    const fetcher: OAuthFetchLike = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return createResponse({ status: 204, contentType: "application/json", body: "" });
    };

    const client = new DefaultOAuthTokenHttpClient({ fetcher });
    await client.revokeToken({
      provider: githubProvider,
      clientId: "Iv1.abc+123",
      clientSecret: "gh-secret/=value%",
      token: "gho_token"
    });

    expect(capturedUrl).toBe("https://api.github.com/applications/Iv1.abc%2B123/token");
    expect(capturedInit?.method).toBe("DELETE");
    expect(capturedInit?.headers["content-type"]).toBe("application/json");
    expect(capturedInit?.headers["accept"]).toBe("application/vnd.github+json");
    const expectedAuth = Buffer.from("Iv1.abc+123:gh-secret/=value%", "utf8").toString("base64");
    expect(capturedInit?.headers["authorization"]).toBe(`Basic ${expectedAuth}`);
    expect(JSON.parse(capturedInit?.body ?? "{}")).toEqual({ access_token: "gho_token" });
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
