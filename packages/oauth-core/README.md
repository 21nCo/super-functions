# @superfunctions/oauth-core

Shared OAuth primitives for provider descriptors, PKCE, redirect validation, and callback invariants.

## Install

```bash
npm install @superfunctions/oauth-core @superfunctions/oauth-storage
```

## Quick Start

```ts
import { DefaultOAuthService } from "@superfunctions/oauth-core";
import { MemoryOAuthStateStore } from "@superfunctions/oauth-storage";

const oauth = new DefaultOAuthService({
  providers: {
    github: {
      id: "github",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      defaultScopes: ["read:user"],
      supportsPkce: true,
      supportsRefreshToken: false,
      tokenAuthMethod: "client_secret_post",
    },
  },
  providerRuntimeConfig: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      allowlistedRedirectUris: ["https://app.example/oauth/callback"],
    },
  },
  stateStore: new MemoryOAuthStateStore(),
  async exchangeCodeForToken() {
    return { accessToken: "access-token" };
  },
});
```

## Package Boundary

`@superfunctions/oauth-core` owns protocol-safe OAuth building blocks:

- provider descriptors
- authorization request creation
- redirect allowlist checks
- PKCE/state generation
- one-time callback state consumption

It does not own HTTP transport, token persistence, or route exposure. Use:

- `@superfunctions/oauth-http` for token exchange and revoke transport
- `@superfunctions/oauth-storage` for state/token persistence
- `@superfunctions/oauth-flow` when you want start/callback/refresh/disconnect orchestration
- `@superfunctions/oauth-router` when you want reusable HTTP routes on top of `oauth-flow`

### Provider transport descriptors

`OAuthProviderDescriptor` includes optional transport fields consumed by
`@superfunctions/oauth-http`: `tokenBodyEncoding` defaults to form encoding;
`tokenHeaders` adds provider-required request headers; `authorizationCodeTokenPath`
selects a nested authorization-code token object without changing refresh response
parsing; and `revocationResponse: "json-ok"` requires an explicit JSON `ok: true`
even when the provider returns HTTP 200. Omitting these fields preserves the
default root-token and HTTP-status behavior.

Package-local `npm test` resolves installed dependency exports, not sibling
sources. Install the declared registry prerequisites before running release gates.

## Production Notes

- Keep provider descriptors static and resolve client/runtime secrets outside source control.
- Treat redirect allowlists as exact-match security controls, not loose prefixes.
- Use durable storage for issued state records in multi-instance deployments.
- Prefer `@superfunctions/oauth-flow` unless you intentionally need custom orchestration.

## Related Packages

- Shared storage: [../oauth-storage/README.md](../oauth-storage/README.md)
- Flow orchestration: [../oauth-flow/README.md](../oauth-flow/README.md)
- Route factories: [../oauth-router/README.md](../oauth-router/README.md)
