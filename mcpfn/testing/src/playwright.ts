import { randomUUID } from "node:crypto";

import {
  expect,
  test as base,
  type Page,
} from "@playwright/test";

import {
  createPkcePair,
  startMockOAuthAuthorizationServer,
  type McpFnMockOAuthAuthorizationServer,
  type McpFnMockOAuthTokenSet,
  type McpFnOAuthCallback,
  type McpFnPkcePair,
  type McpFnStartedMockOAuthServer,
} from "./mock-oauth-server.js";

export interface McpFnOAuthAuthorizationRequestOptions {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  pkce?: McpFnPkcePair;
  state?: string;
  scopes?: string[];
  resource?: string;
  extraParameters?: Record<string, string>;
}

export interface McpFnOAuthBrowserOptions
  extends McpFnOAuthAuthorizationRequestOptions {
  decision?: "approve" | "deny";
  approveButtonName?: string | RegExp;
  denyButtonName?: string | RegExp;
  beforeDecision?(page: Page): void | Promise<void>;
}

export interface McpFnOAuthBrowserResult {
  authorizationUrl: string;
  callback: McpFnOAuthCallback;
  pkce: McpFnPkcePair;
  state: string;
}

export function createOAuthAuthorizationRequestUrl(
  options: McpFnOAuthAuthorizationRequestOptions,
): { url: string; pkce: McpFnPkcePair; state: string } {
  const pkce = options.pkce ?? createPkcePair();
  const state = options.state ?? `mcpfn_state_${randomUUID()}`;
  const url = new URL(options.authorizationEndpoint);
  for (const [name, value] of Object.entries(options.extraParameters ?? {})) {
    url.searchParams.set(name, value);
  }
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("code_challenge", pkce.challenge);
  url.searchParams.set("code_challenge_method", pkce.method);
  url.searchParams.set("state", state);
  if (options.scopes?.length) url.searchParams.set("scope", options.scopes.join(" "));
  if (options.resource) url.searchParams.set("resource", options.resource);
  return { url: url.toString(), pkce, state };
}

export function parseOAuthCallback(url: string | URL): McpFnOAuthCallback {
  const callback = new URL(url);
  return {
    url: callback.toString(),
    parameters: Object.fromEntries(callback.searchParams),
  };
}

/** Drives an authorization-code + PKCE approval or denial through real UI. */
export async function authorizeWithBrowser(
  page: Page,
  options: McpFnOAuthBrowserOptions,
): Promise<McpFnOAuthBrowserResult> {
  const request = createOAuthAuthorizationRequestUrl(options);
  await page.goto(request.url);
  await options.beforeDecision?.(page);
  const decision = options.decision ?? "approve";
  const buttonName = decision === "approve"
    ? options.approveButtonName ?? /^approve$/i
    : options.denyButtonName ?? /^deny$/i;
  await page.getByRole("button", { name: buttonName }).click();
  const redirect = new URL(options.redirectUri);
  await page.waitForURL((candidate) =>
    candidate.origin === redirect.origin && candidate.pathname === redirect.pathname);
  const callback = parseOAuthCallback(page.url());
  if (callback.parameters.state !== request.state) {
    throw new Error("OAuth callback state does not match the authorization request");
  }
  return {
    authorizationUrl: request.url,
    callback,
    pkce: request.pkce,
    state: request.state,
  };
}

export async function exchangeAuthorizationCode(options: {
  tokenEndpoint: string;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  fetch?: typeof globalThis.fetch;
}): Promise<McpFnMockOAuthTokenSet> {
  const response = await (options.fetch ?? globalThis.fetch)(options.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      code: options.code,
      code_verifier: options.codeVerifier,
    }),
  });
  const body = await response.json() as McpFnMockOAuthTokenSet & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(body.error_description ?? body.error ?? `Token exchange failed with ${response.status}`);
  }
  return body;
}

export async function refreshOAuthAccessToken(options: {
  tokenEndpoint: string;
  clientId: string;
  refreshToken: string;
  scopes?: string[];
  fetch?: typeof globalThis.fetch;
}): Promise<McpFnMockOAuthTokenSet> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: options.clientId,
    refresh_token: options.refreshToken,
  });
  if (options.scopes?.length) form.set("scope", options.scopes.join(" "));
  const response = await (options.fetch ?? globalThis.fetch)(options.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const body = await response.json() as McpFnMockOAuthTokenSet & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(body.error_description ?? body.error ?? `Token refresh failed with ${response.status}`);
  }
  return body;
}

export async function revokeOAuthToken(options: {
  revocationEndpoint: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<void> {
  const response = await (options.fetch ?? globalThis.fetch)(options.revocationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: options.token }),
  });
  if (!response.ok) throw new Error(`Token revocation failed with ${response.status}`);
}

export interface McpFnOAuthPlaywrightFixture {
  started: McpFnStartedMockOAuthServer;
  server: McpFnMockOAuthAuthorizationServer;
  authorize(
    page: Page,
    options?: Partial<Omit<McpFnOAuthBrowserOptions, "authorizationEndpoint" | "clientId" | "redirectUri">> & {
      authorizationEndpoint?: string;
      clientId?: string;
      redirectUri?: string;
    },
  ): Promise<McpFnOAuthBrowserResult>;
}

export interface McpFnPlaywrightFixtures {
  mcpfnOAuth: McpFnOAuthPlaywrightFixture;
}

/**
 * Ready-to-extend Playwright test. Applications may import this `test` and add
 * their own signed-in page or database fixtures without rebuilding OAuth mocks.
 */
export const test = base.extend<McpFnPlaywrightFixtures>({
  mcpfnOAuth: async ({}, use) => {
    const started = await startMockOAuthAuthorizationServer();
    const fixture: McpFnOAuthPlaywrightFixture = {
      started,
      server: started.oauth,
      authorize: (page, options = {}) => authorizeWithBrowser(page, {
        authorizationEndpoint: options.authorizationEndpoint ?? started.oauth.authorizationEndpoint,
        clientId: options.clientId ?? started.oauth.clientId,
        redirectUri: options.redirectUri ?? started.oauth.callbackUrl,
        ...options,
      }),
    };
    try {
      await use(fixture);
    } finally {
      await started.close();
    }
  },
});

export { expect };
