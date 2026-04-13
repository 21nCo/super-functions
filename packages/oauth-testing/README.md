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

## Docs

- Canonical docs: [docs/content/docs/authentication/oauth-testing.mdx](../../docs/content/docs/authentication/oauth-testing.mdx)
- Stack overview: [docs/content/docs/architecture/oauth-flow-architecture.mdx](../../docs/content/docs/architecture/oauth-flow-architecture.mdx)
