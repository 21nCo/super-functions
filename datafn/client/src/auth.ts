import type { HttpTransportAuthPlugin } from '@superfunctions/http';

/**
 * Creates a transport auth plugin for DataFn public-link access.
 */
export function createDatafnPublicLinkAuthPlugin(
  publicLinkToken: string | (() => string | undefined | null | Promise<string | undefined | null>),
): HttpTransportAuthPlugin {
  return {
    getRequestHeaders: async () => {
      const value = typeof publicLinkToken === 'function'
        ? await publicLinkToken()
        : publicLinkToken;
      const token = value?.trim();
      return token
        ? { 'x-datafn-public-link-token': token }
        : undefined;
    }
  };
}
