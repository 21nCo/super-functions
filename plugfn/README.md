# PlugFn

PlugFn is the shared, self-hosted integration runtime for Superfunctions apps. It centralizes provider registration, connection lifecycle, OAuth/webhook route exposure, and workflow execution so apps such as nucleus can reuse one integration substrate instead of rebuilding provider glue per app.

## Current status

- PlugFn does not make blanket production-ready claims across every provider or vertical module.
- Production claims are provider-specific and only valid on commits where `npm run gate:plugfn-release` passes and the provider is marked `production` in [docs/provider-readiness-matrix.md](./docs/provider-readiness-matrix.md).
- Inbound email account connections and ingestion are part of the PlugFn runtime contract. Email products, outbound delivery, and app-specific interpretation remain outside PlugFn or optional vertical surfaces.

## Package contract

- TypeScript runtime: `plugfn`
- CLI: `@plugfn/cli`
- Python package: `plugfn` (experimental)

## Install

```bash
npm install plugfn @superfunctions/db @superfunctions/http
npm install -D @plugfn/cli
```

```bash
pip install plugfn
```

## TypeScript quick start

```ts
import { createPlugFnRouter, plugFn } from 'plugfn';
import { githubProvider, linearProvider, notionProvider } from '@plugfn/providers';

const plug = plugFn({
  database: adapter,
  auth: authProvider,
  baseUrl: 'https://app.example.com',
  encryptionKey: process.env.ENCRYPTION_KEY!,
  integrations: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    linear: {
      clientId: process.env.LINEAR_CLIENT_ID!,
      clientSecret: process.env.LINEAR_CLIENT_SECRET!,
    },
    notion: {
      clientId: process.env.NOTION_CLIENT_ID!,
      clientSecret: process.env.NOTION_CLIENT_SECRET!,
    },
  },
});

plug.providers.register(githubProvider);
plug.providers.register(linearProvider);
plug.providers.register(notionProvider);

const router = createPlugFnRouter(plug);
```

Python examples exist, but the Python runtime is still experimental and does not yet match the TypeScript provider surface. Use the matrix below before treating any Python provider as adoption-ready.

## Readiness model

- Core provider set tracked by the release gate: `github`, `linear`, `clickup`, `gmail`, `notion`
- Additional providers, including inbound email connectors outside the gated core set, may remain `beta`, `experimental`, `vertical-only`, or `unsupported`; inclusion in runtime scope does not imply production readiness
- Unlisted providers are unsupported by default

See:

- [docs/provider-readiness-matrix.md](./docs/provider-readiness-matrix.md)
- [docs/client-sdk-boundary.md](./docs/client-sdk-boundary.md)
- [docs/operations/release-gates.md](./docs/operations/release-gates.md)

## Documentation

- [SPEC.md](./SPEC.md) - public product contract and release conditions
- [core/README.md](./core/README.md) - TypeScript runtime usage
- [python/README.md](./python/README.md) - Python runtime status and usage
- [docs/getting-started.md](./docs/getting-started.md) - setup and route-mounting walkthrough
- [docs/provider-readiness-matrix.md](./docs/provider-readiness-matrix.md) - truthful provider status inventory
- [docs/client-sdk-boundary.md](./docs/client-sdk-boundary.md) - browser/client safety boundary

## License

Apache-2.0
