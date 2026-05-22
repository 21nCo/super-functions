---
title: Authoring custom plugins
description: Step-by-step guide to writing your own authfn plugin — schema, routes, hooks, observability, and OpenAPI integration.
---

# Authoring custom plugins

If your auth flow isn't a sign-in method but a *capability* (issue invite codes, reissue magic links from a CLI, mint signed download URLs, …), the right extension point is usually a custom plugin. Plugins:

- declare their own database tables,
- contribute routes that show up in the OpenAPI document,
- read the kernel's runtime resolution, hooks, and session manager,
- emit observability events,
- throw typed errors that the kernel converts into envelopes.

This page is the practical guide. Read [Concepts → Plugins](../core-concepts/plugins) first for the conceptual model.

## The shape

```ts
interface AuthFnPlugin {
  name: string;
  schema?(config: AuthFnConfig): TableSchema[];
  routes?(ctx: AuthFnPluginRuntimeContext): Route[];
  hooks?: Partial<AuthFnHooks>;
  hookFailurePolicy?: Partial<Record<keyof AuthFnHooks, 'observe' | 'fail'>>;
  validateConfig?(config: AuthFnConfig): void;
}
```

A plugin is a *passive descriptor* — nothing in the function runs at module-import time.

## A complete tiny plugin

This plugin lets the current user mint a one-time URL they can share to "sign in as me on another device":

```ts
import { randomBytes, createHash } from 'node:crypto';
import type {
  AuthFnPlugin,
  AuthFnPluginRuntimeContext,
  AuthFnConfig,
} from '@authfn/core';
import {
  AuthFnError,
  AuthFnNotFoundError,
  AuthFnUnauthenticatedError,
  AuthFnValidationError,
  resolveRuntime,
  authenticateRequest,
  issueSession,
} from '@authfn/core';
import { jsonSuccess } from '@authfn/core/http';     // hypothetical re-export

const TABLE = 'magic_links';

export function magicLinkPlugin(): AuthFnPlugin {
  return {
    name: 'magicLink',
    schema: () => [
      {
        modelName: TABLE,
        fields: {
          id: { type: 'string', required: true, fieldName: 'id' },
          userId: { type: 'string', required: true, fieldName: 'user_id' },
          codeHash: { type: 'string', required: true, fieldName: 'code_hash' },
          expiresAt: { type: 'date', required: true, fieldName: 'expires_at' },
          consumedAt: { type: 'date', required: false, fieldName: 'consumed_at' },
          createdAt: { type: 'date', required: true, fieldName: 'created_at' },
        },
        indexes: [{ name: 'idx_magic_links_code_hash', fields: ['codeHash'], unique: true }],
      },
    ],
    routes: (ctx) => createRoutes(ctx),
  };
}

function createRoutes(ctx: AuthFnPluginRuntimeContext) {
  return [
    {
      method: 'POST' as const,
      path: '/magic/issue',
      operationId: 'issueMagicLink',
      summary: 'Issue a one-time magic-link code',
      tags: ['authfn', 'magic-link'],
      handler: async (request: Request) => {
        const session = await authenticateRequest(ctx.config, request);
        if (!session) throw new AuthFnUnauthenticatedError();

        const code = randomBytes(16).toString('base64url');
        const codeHash = createHash('sha256').update(code).digest('hex');
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

        await ctx.config.database.create({
          model: TABLE,
          data: {
            id: randomBytes(8).toString('hex'),
            userId: session.actorId,
            codeHash,
            expiresAt,
            createdAt: new Date(),
          },
          namespace: ctx.namespace,
        });

        return jsonSuccess({ code, expiresAt });
      },
    },
    {
      method: 'POST' as const,
      path: '/magic/redeem',
      operationId: 'redeemMagicLink',
      summary: 'Redeem a one-time magic-link code and issue a session',
      tags: ['authfn', 'magic-link'],
      handler: async (request: Request) => {
        const body = await request.json().catch(() => ({})) as { code?: string };
        if (!body.code) throw new AuthFnValidationError('code is required');
        const codeHash = createHash('sha256').update(body.code).digest('hex');

        const row = await ctx.config.database.findOne({
          model: TABLE,
          where: [{ field: 'codeHash', operator: 'eq', value: codeHash }],
          namespace: ctx.namespace,
        });

        if (!row) throw new AuthFnNotFoundError('magic link unknown');
        if (row.consumedAt) throw new AuthFnError('AUTHFN_OTP_REPLAYED', 'already used', { status: 409 });
        if (row.expiresAt < new Date()) throw new AuthFnError('AUTHFN_OTP_EXPIRED', 'expired', { status: 400 });

        await ctx.config.database.update({
          model: TABLE,
          where: [{ field: 'id', operator: 'eq', value: row.id }],
          data: { consumedAt: new Date() },
          namespace: ctx.namespace,
        });

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: row.userId,
          methods: ['magic-link' as any],   // your custom method
        });

        return jsonSuccess({ session: issued.session });
      },
    },
  ];
}
```

The plugin:

- declares one table (`magic_links`);
- exposes two routes (`/magic/issue`, `/magic/redeem`);
- authenticates `/magic/issue` (uses kernel `authenticateRequest`);
- hashes the code at rest;
- enforces single-use and expiry;
- issues a session through the kernel's session manager so all `*SessionIssue` hooks still fire and observability events still emit.

## Plugin runtime context

```ts
interface AuthFnPluginRuntimeContext {
  config: AuthFnConfig;
  namespace: string;            // your kernel's namespace
  basePath: string;             // typically '/auth'
  hooks: Partial<AuthFnHooks>;  // composed kernel + plugin hooks
  runtimeResolver?: AuthFnRuntimeResolver;
}
```

Your routes receive `ctx` from the plugin runner. Use `ctx.namespace` when reading/writing through the database adapter; never hardcode `'authfn'`.

## Schema descriptor

The kernel composes your `schema(config)` with everything else. Your tables are real database tables — they need migrations like any other. After enabling your plugin, run:

```bash
npx @superfunctions/cli generate
```

…and ship the migrations alongside your code.

## Routes

The kernel reads:

- `method`: HTTP method.
- `path`: relative to the kernel's `basePath`.
- `meta.operationId`: stable, camelCase, unique.
- `meta.summary`: one-line description.
- `meta.tags`: at least `['authfn']`; add a plugin-specific tag.
- `meta.csrf`: `'mode': 'none' | 'enforce'`. Default: `enforce` for mutating methods on cookie-authenticated paths.
- `handler`: `(Request) => Promise<Response | { status, json, headers? }>`.

Throw `AuthFnError` for failures. The kernel converts to envelopes and emits `authfn.request.failed`.

## Hooks

Plugins can register hooks:

```ts
{
  name: 'analytics',
  hooks: {
    afterUserCreate(ctx, user) { trackUserCreated(user.id); },
  },
  hookFailurePolicy: { afterUserCreate: 'observe' },
}
```

Hook ordering: kernel `before*` → plugin `before*` (in plugin order) → handler → plugin `after*` → kernel `after*`. See [Concepts → Hooks](../core-concepts/hooks).

## Observability

Use `emitAuthEvent(config, event)` to push events. The kernel exposes the helpers under `@authfn/core` (or you can call `config.observability?.emit(event)` directly).

```ts
await config.observability?.emit?.({
  type: 'magic_link.issued' as any,           // your custom event type
  requestId: <from request id helper>,
  userId: session.actorId,
  metadata: { ttlSeconds: 300 },
});
```

Note: typed event types are part of `AuthFnEventType`. Custom events use freeform strings; set up your sink to be tolerant of unknown types or extend the type union locally.

## OpenAPI integration

Routes' `meta` is what the OpenAPI generator reads. Setting `operationId`, `summary`, and `tags` is sufficient for the route to show up in `auth.openApi()`. Request/response schemas are not yet declared in the bundled plugins; the same is true for custom plugins — at the moment, the OpenAPI surface is paths + operations.

## Validation

Use `validateConfig(config)` to fail fast at construction:

```ts
{
  name: 'my-plugin',
  validateConfig(config) {
    const present = config.plugins.some((p) => p.name === 'twoFactor');
    if (!present) {
      throw new AuthFnConfigError('my-plugin requires twoFactor to be enabled');
    }
  },
}
```

## Testing

Plugins can be unit-tested by:

1. Constructing an `AuthFn` instance with `memoryAdapter` and your plugin enabled.
2. Calling `auth.router.fetch(<Request>)` directly.
3. Asserting on the response envelope.

The bundled plugins follow this pattern; see `core/src/__tests__/*.test.ts` for examples.

## Publishing

Plugins are just npm packages. Publish under your scope; consumers install and add to their `plugins` array. Document:

- The factory function signature and config options.
- The schema tables and any required migrations.
- The routes and operation ids.
- The events emitted.
- The errors thrown.

## Related

- [Concepts → Plugins](../core-concepts/plugins)
- [Concepts → Hooks](../core-concepts/hooks)
- [Concepts → Errors](../core-concepts/errors)
- [Concepts → Observability](../core-concepts/observability)
