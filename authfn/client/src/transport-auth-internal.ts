import type { HttpTransportAuthProvider } from '@superfunctions/http';
import type { AuthFnTransportAuthOptions } from './transport-auth.js';

export type AuthFnBearerTokenProvider =
  string | (() => string | undefined | null | Promise<string | undefined | null>);

interface AuthFnSessionTransportAuthOptions extends AuthFnTransportAuthOptions {
  bearerToken?: AuthFnBearerTokenProvider;
  credentials?: RequestCredentials;
}

/**
 * Creates an AuthFn transport auth provider from resolved session material.
 */
export function createAuthFnSessionTransportAuth(
  options: AuthFnSessionTransportAuthOptions = {},
): HttpTransportAuthProvider {
  return {
    getCredentials: () =>
      options.credentials ?? (options.bearerToken === undefined ? 'include' : 'omit'),
    getRequestHeaders: async () => {
      const headers: Record<string, string> = {};
      const bearerToken = await resolveToken(options.bearerToken);
      if (bearerToken) {
        headers.authorization = `Bearer ${bearerToken}`;
      }
      new Headers((await resolveHeaders(options.headers)) ?? undefined).forEach((value, key) => {
        headers[key] = value;
      });
      for (const plugin of options.plugins ?? []) {
        new Headers((await plugin.getRequestHeaders?.()) ?? undefined).forEach((value, key) => {
          headers[key] = value;
        });
      }
      return headers;
    },
    onUnauthorized: options.onUnauthorized
  };
}

async function resolveHeaders(
  headers: HeadersInit | (() => HeadersInit | null | undefined | Promise<HeadersInit | null | undefined>) | undefined,
): Promise<HeadersInit | null | undefined> {
  return typeof headers === 'function' ? await headers() : headers;
}

async function resolveToken(
  token: AuthFnBearerTokenProvider | undefined,
): Promise<string | undefined> {
  const value = typeof token === 'function' ? await token() : token;
  return value?.trim() || undefined;
}
