# @superfunctions/oauth-flow

High-level OAuth lifecycle orchestration for start, callback, refresh, and disconnect workflows.

## Install

```bash
npm install @superfunctions/oauth-flow @superfunctions/oauth-providers @superfunctions/oauth-storage
```

## Quick Start

```ts
import { createOAuthFlowService } from "@superfunctions/oauth-flow";
import { getOAuthProviderDescriptor } from "@superfunctions/oauth-providers";
import {
  AesGcmTokenCipher,
  EncryptedTokenVault,
  MemoryOAuthStateStore,
  MemoryTokenVault,
} from "@superfunctions/oauth-storage";

const encryptionKeyHex = process.env.OAUTH_TOKEN_ENCRYPTION_KEY_HEX!;
const tokenVault = new EncryptedTokenVault(
  new MemoryTokenVault(),
  new AesGcmTokenCipher(() => Buffer.from(encryptionKeyHex, "hex")),
);

const flow = createOAuthFlowService({
  providers: {
    github: getOAuthProviderDescriptor("github"),
  },
  providerRuntimeConfig: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowlistedRedirectUris: ["https://app.example/oauth/github/callback"],
    },
  },
  stateStore: new MemoryOAuthStateStore(),
  tokenVault,
});
```

## Package Boundary

`@superfunctions/oauth-flow` composes:

- `@superfunctions/oauth-core` for state and callback invariants
- `@superfunctions/oauth-http` for token transport
- `@superfunctions/oauth-storage` for state/token persistence

It owns orchestration and lifecycle hooks, not route adapters. Use `@superfunctions/oauth-router` when you want reusable HTTP endpoints.

Keep `OAUTH_TOKEN_ENCRYPTION_KEY_HEX` as a deployment secret with 32 random bytes encoded as hex.

## Production Notes

- `EncryptedTokenVault` defaults to `tokenStorageMode: "encrypted-required"`.
- Legacy plain `TokenVault` wiring stays writable by default for backward compatibility, but new production deployments should migrate to `EncryptedTokenVault`.
- Set `tokenStorageMode: "encrypted-required"` explicitly if you want upgrades to fail closed on plaintext persistence.
- `plaintext-unsafe` is for tests, local prototypes, and temporary migration windows only.
- `disconnect()` now reports `connectionCleanup`, and `connectionDeleted` remains only as a deprecated compatibility alias of `connectionCleanup.deleted`.
- Keep `resolveProviderRuntimeConfig` deterministic across app servers and background workers.

## Verification

- Repo-root gate: `npm run gate:packages-oauth-shared`
- Package-local tests: `npm test --workspace @superfunctions/oauth-flow`

## Related Packages

- OAuth core primitives: [../oauth-core/README.md](../oauth-core/README.md)
- Shared storage: [../oauth-storage/README.md](../oauth-storage/README.md)
- Route factories: [../oauth-router/README.md](../oauth-router/README.md)
