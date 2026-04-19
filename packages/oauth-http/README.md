# @superfunctions/oauth-http

Reusable OAuth token transport for code exchange, refresh, revocation, retries, and normalized upstream errors.

## Install

```bash
npm install @superfunctions/oauth-http @superfunctions/oauth-core @superfunctions/oauth-providers
```

## Quick Start

```ts
import { DefaultOAuthTokenHttpClient } from "@superfunctions/oauth-http";
import { getOAuthProviderDescriptor } from "@superfunctions/oauth-providers";

const client = new DefaultOAuthTokenHttpClient();
const github = getOAuthProviderDescriptor("github");

const tokenSet = await client.exchangeToken({
  provider: github,
  grantType: "authorization_code",
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  code: "oauth-code",
  redirectUri: "https://app.example/oauth/github/callback",
});
```

## Package Boundary

`@superfunctions/oauth-http` owns OAuth HTTP transport only:

- token endpoint exchange
- refresh exchange
- revocation requests
- retry policy and normalized transport errors

It does not own state validation, token persistence, or route generation. Pair it with:

- `@superfunctions/oauth-core` for callback invariants
- `@superfunctions/oauth-flow` for full lifecycle orchestration
- `@superfunctions/oauth-router` for route exposure

## Production Notes

- Provide secrets through `clientSecretResolver` when your platform resolves secrets dynamically.
- Tune retries for provider-specific 429/5xx behavior instead of wrapping token calls with ad hoc fetch logic.
- Treat provider revocation as best effort unless your product contract requires remote confirmation before local cleanup.

## Related Packages

- OAuth core primitives: [../oauth-core/README.md](../oauth-core/README.md)
- Provider descriptors: [../oauth-providers/README.md](../oauth-providers/README.md)
- Route factories: [../oauth-router/README.md](../oauth-router/README.md)
