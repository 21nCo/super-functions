import type { OAuthProviderDescriptor } from "@superfunctions/oauth-core";
export {
  MemoryOAuthStateStore as InMemoryOAuthStateStore,
  MemoryTokenVault as InMemoryTokenVault
} from "@superfunctions/oauth-storage";
export {
  createAuthFnSchemaCompositionFixture,
  createBrowserAuthFixture,
  redactSecrets,
} from "./browser-auth-fixtures.js";

export function createMockOAuthProviderDescriptor(
  overrides: Partial<OAuthProviderDescriptor> = {}
): OAuthProviderDescriptor {
  return {
    id: "mock",
    authorizationUrl: "https://mock.example/auth",
    tokenUrl: "https://mock.example/token",
    defaultScopes: ["read"],
    supportsPkce: true,
    supportsRefreshToken: true,
    scopeSeparator: " ",
    tokenAuthMethod: "client_secret_post",
    ...overrides
  };
}
