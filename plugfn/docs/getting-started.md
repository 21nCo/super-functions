# Getting Started with PlugFn

PlugFn is the shared integration runtime for Superfunctions apps. This guide uses the current public package contract and stays within the current truthful scope boundary.

## Install

```bash
npm install plugfn @plugfn/providers @plugfn/client @superfunctions/db @superfunctions/http
```

Optional CLI:

```bash
npm install -D @plugfn/cli
```

## Core setup

```ts
import { plugFn } from 'plugfn';
import { githubProvider, linearProvider, notionProvider } from '@plugfn/providers';

const plug = plugFn({
  database: adapter,
  auth: {
    async authenticate(request) {
      const session = await authProvider.authenticate(request);
      if (!session) {
        return null;
      }

      return {
        userId: session.userId,
        tenantId: session.tenantId,
      };
    },
  },
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
```

## Shared persistence and HTTP adapters

PlugFn is expected to sit on top of:

- `@superfunctions/db` for shared persistence contracts
- `@superfunctions/http` plus framework adapters for route exposure
- the shared OAuth package family for OAuth orchestration

## Mounting routes

### Express

```ts
import express from 'express';
import { toExpress } from '@superfunctions/http-express';
import { createPlugFnRouter } from 'plugfn';

const app = express();
app.use('/api/plugfn', toExpress(createPlugFnRouter(plug)));
```

### Fastify

```ts
import Fastify from 'fastify';
import { toFastify } from '@superfunctions/http-fastify';
import { createPlugFnRouter } from 'plugfn';

const app = Fastify();
app.register(toFastify(createPlugFnRouter(plug)), { prefix: '/api/plugfn' });
```

### Hono

```ts
import { Hono } from 'hono';
import { toHono } from '@superfunctions/http-hono';
import { createPlugFnRouter } from 'plugfn';

const app = new Hono();
app.route('/api/plugfn', toHono(createPlugFnRouter(plug)));
```

The canonical TypeScript route inventory exposed by `createPlugFnRouter(plug)` is:

- `GET /callback`
- `GET /callback/:provider`
- `POST /webhooks/:provider`
- `POST /webhooks/:provider/:event`
- `GET /providers`
- `GET /connections`
- `GET /connections/:connectionId`
- `GET /connections/:connectionId/status`
- `POST /connections/start`
- `POST /connections/disconnect`
- `GET /workflows`
- `POST /sync/jobs`
- `GET /sync/jobs`
- `GET /sync/jobs/:jobId`
- `POST /sync/jobs/:jobId/cancel`
- `POST /sync/checkpoints`
- `GET /events`
- `GET /metrics`

For non-webhook routes, PlugFn derives the principal from `plug.config.auth.authenticate` unless you pass an explicit router auth override. Any caller-supplied `userId` or `tenantId` values are treated as assertions and rejected with `TENANT_ACCESS_DENIED` when they do not match the derived principal.

## Readiness before adoption

Before treating any provider as adoption-ready, check:

1. [provider-readiness-matrix.md](./provider-readiness-matrix.md)
2. [client-sdk-boundary.md](./client-sdk-boundary.md)
3. [operations/release-gates.md](./operations/release-gates.md)

The current core provider set tracked by release gating is:

- `github`
- `linear`
- `clickup`
- `gmail`
- `notion`

## Release verification

PlugFn now has one authoritative repo-root release gate:

```bash
npm run gate:plugfn-release
```

Do not claim global production readiness from source-tree presence alone. Production wording is only allowed on commits where that command passes and the provider/runtime surface is marked `production` in the readiness matrix.

The gate includes repo-root inventory checks that look for:

- outdated scoped-package install instructions
- machine-specific local paths in public docs
- stale future-gate wording in public docs
- missing core-provider readiness coverage
