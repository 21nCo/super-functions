import type { OAuthTokenSet } from "@superfunctions/oauth-core";
import type { OAuthFlowCallbackInput, OAuthFlowStartInput } from "@superfunctions/oauth-flow";

export interface BrowserAuthFixture {
  startInput: OAuthFlowStartInput;
  callbackInput: OAuthFlowCallbackInput;
  tokenSet: OAuthTokenSet;
  eventSnapshot: Record<string, unknown>;
}

export interface AuthFnSchemaCompositionFixture {
  config: {
    namespace: string;
    plugins: string[];
  };
  expectedTables: string[];
}

const REDACTED = "[REDACTED]";

export function createBrowserAuthFixture(): BrowserAuthFixture {
  const tokenSet: OAuthTokenSet = {
    accessToken: "access-secret-token",
    refreshToken: "refresh-secret-token",
    tokenType: "Bearer",
    expiresAt: "2026-03-22T00:00:00.000Z",
    idToken: "id-secret-token",
  };

  return {
    startInput: {
      providerId: "google",
      redirectUri: "https://app.example/callback",
      subject: {
        kind: "browser-auth",
        intentId: "intent_browser_01",
        returnTo: "https://app.example/post-auth",
      },
      requestId: "req_browser_01",
    },
    callbackInput: {
      providerId: "google",
      code: "oauth-code-01",
      state: "st_browser_01",
      redirectUri: "https://app.example/callback",
      requestId: "req_browser_02",
    },
    tokenSet,
    eventSnapshot: redactSecrets({
      name: "oauth.flow.callback.success",
      requestId: "req_browser_02",
      details: {
        accessToken: tokenSet.accessToken,
        refreshToken: tokenSet.refreshToken,
        idToken: tokenSet.idToken,
        providerId: "google",
      },
    }) as Record<string, unknown>,
  };
}

export function createAuthFnSchemaCompositionFixture(): AuthFnSchemaCompositionFixture {
  return {
    config: {
      namespace: "auth",
      plugins: ["password", "emailOtp", "socialOAuth"],
    },
    expectedTables: [
      "users",
      "sessions",
      "password_credentials",
      "otp_challenges",
      "oauth_accounts",
    ],
  };
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        shouldRedactKey(key) ? REDACTED : redactValue(entryValue),
      ])
    );
  }

  return value;
}

function shouldRedactKey(key: string): boolean {
  return /(token|secret|authorization|bearer|password)/i.test(key);
}
