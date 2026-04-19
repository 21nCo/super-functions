# @superfunctions/oauth-storage

Shared OAuth state and token persistence contracts, adapters, and encryption helpers.

## Install

```bash
npm install @superfunctions/oauth-storage @superfunctions/db
```

## Quick Start

Production code should persist tokens through `EncryptedTokenVault`.

```ts
import {
  AesGcmTokenCipher,
  EncryptedTokenVault,
  MemoryOAuthStateStore,
  MemoryTokenVault,
} from "@superfunctions/oauth-storage";

const stateStore = new MemoryOAuthStateStore();
const cipher = new AesGcmTokenCipher((keyRef) => {
  if (keyRef !== "oauth-default") {
    throw new Error("unknown keyRef");
  }

  return Buffer.alloc(32, 7);
});

const tokenVault = new EncryptedTokenVault(new MemoryTokenVault(), cipher);
```

If you want the shared DB abstraction, `createOAuthDbStorage(...)` builds the stores with the correct default model names:

```ts
import { createOAuthDbStorage } from "@superfunctions/oauth-storage";

const { stateStore, tokenVault, models } = createOAuthDbStorage({
  adapter,
});

console.log(models.oauthStates); // oauth_states
console.log(models.oauthTokenVault); // oauth_tokens
```

## Package Boundary

`@superfunctions/oauth-storage` owns:

- `OAuthStateStore` for short-lived redirect state
- `TokenVault` for connection-bound token records
- consent and revocation-failure stores
- in-memory, SQL, and `@superfunctions/db` adapters
- `EncryptedTokenVault`, `TokenCipher`, and `AesGcmTokenCipher`

It does not decide when to start OAuth, exchange tokens, or expose HTTP endpoints.

## Production Notes

- The default SQL/DB token model name is `oauth_tokens`.
- `MemoryOAuthStateStore` and `MemoryTokenVault` are fine for tests and small prototypes, but not for multi-instance production deployments.
- Prefer `EncryptedTokenVault` for durable token storage so plaintext token JSON never becomes the long-lived record format.
- If you already use a custom token table/model name, keep passing `models.oauthTokenVault` until your schema migration is complete.

## Related Packages

- OAuth core primitives: [../oauth-core/README.md](../oauth-core/README.md)
- Flow orchestration: [../oauth-flow/README.md](../oauth-flow/README.md)
- Test fixtures: [../oauth-testing/README.md](../oauth-testing/README.md)
