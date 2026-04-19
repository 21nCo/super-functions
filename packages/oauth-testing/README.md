# @superfunctions/oauth-testing

Deterministic OAuth testing helpers built on the shared in-memory storage contracts.

## Install

```bash
npm install -D @superfunctions/oauth-testing vitest
```

## Quick Start

```ts
import {
  InMemoryOAuthStateStore,
  InMemoryTokenVault,
  createMockOAuthProviderDescriptor,
} from "@superfunctions/oauth-testing";

const provider = createMockOAuthProviderDescriptor({
  id: "mock-github",
  defaultScopes: ["read:user"],
});

const stateStore = new InMemoryOAuthStateStore();
const tokenVault = new InMemoryTokenVault();
```

## Package Boundary

`@superfunctions/oauth-testing` owns test fixtures only:

- `createMockOAuthProviderDescriptor()`
- in-memory fixture aliases from `@superfunctions/oauth-storage`
- browser-auth schema/composition fixtures

It is not a production runtime package and should not be used as your durable OAuth storage layer.

## Production Notes

- Use this package only in tests or local harnesses.
- If you need production routing, use `@superfunctions/oauth-router`.
- If you need production token persistence, use `@superfunctions/oauth-storage` and prefer `EncryptedTokenVault`.

## Related Packages

- Shared storage: [../oauth-storage/README.md](../oauth-storage/README.md)
- Flow orchestration: [../oauth-flow/README.md](../oauth-flow/README.md)
- Route factories: [../oauth-router/README.md](../oauth-router/README.md)
