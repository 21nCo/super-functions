# @superfunctions/oauth-providers

Curated OAuth provider descriptors plus a shared provider-policy registry.

## Install

```bash
npm install @superfunctions/oauth-providers @superfunctions/oauth-core
```

## Quick Start

```ts
import {
  createDefaultProviderPolicyRegistry,
  getOAuthProviderDescriptor,
} from "@superfunctions/oauth-providers";

const github = getOAuthProviderDescriptor("github");
const registry = createDefaultProviderPolicyRegistry();

const consent = await registry.validateScopes({
  providerId: "github",
  feature: "profile.basic",
  requestedScopes: github.defaultScopes,
  tenantId: "tenant_1",
  userId: "user_1",
  purpose: "Connect a GitHub account",
});
```

## Package Boundary

`@superfunctions/oauth-providers` owns:

- curated provider descriptors
- provider capability and scope policies
- consent and policy-audit registry contracts

It does not perform token exchange, persist OAuth tokens, or expose routes.

## Production Notes

- `createDefaultProviderPolicyRegistry()` is an in-memory convenience path, not a durable compliance boundary.
- For production consent/audit retention, pass explicit `consentStore` and `auditStore`.
- Registry methods that persist policy state are async because store writes are now part of the contract.
- If you need a provider not bundled here, pass your own descriptor into `@superfunctions/oauth-core` or `@superfunctions/oauth-flow`.

## Related Packages

- OAuth core primitives: [../oauth-core/README.md](../oauth-core/README.md)
- Flow orchestration: [../oauth-flow/README.md](../oauth-flow/README.md)
- Route factories: [../oauth-router/README.md](../oauth-router/README.md)
