---
title: Authoring custom plugins
description: Step-by-step guide to writing your own authfn plugin — schema, routes, hooks, observability, and OpenAPI integration.
---

# Authoring custom plugins

If your auth flow isn't a sign-in method but a *capability* (issue invite codes, reissue magic links from a CLI, mint signed download URLs, …), the right extension point is usually a custom plugin. Plugins:

- declare their own database tables,
- contribute routes that show up in the OpenAPI document,
- read the kernel's environment resolution, hooks, and session manager,
- emit observability events,
- throw typed errors that the kernel converts into envelopes.

This page is the practical guide. Read [Concepts → Plugins](../core-concepts/plugins) first for the conceptual model.

## The shape

```ts
interface AuthFnPlugin<
  TName extends string = string,
  TRuntimeConfig extends object = never,
  TRuntimeRequired extends boolean = false
> {
  name: TName;
  schema?: (config: AuthFnConfig) => AuthFnSchemaDefinition["schemas"];
  routes?: (ctx: AuthFnPluginRuntimeContext) => Route[];
  hooks?: Partial<AuthFnHooks>;
  hookFailurePolicy?: Partial<Record<keyof AuthFnHooks, "observe" | "fail">>;
  validateConfig?: (config: AuthFnRuntimeConfig) => void;
}
```

A plugin is a *passive descriptor* — nothing in the function runs at module-import time. Install `authfn` and import the contract from the kernel package, not from a plugin package.

## A complete tiny plugin

This plugin lets the current user mint a one-time URL they can share to "sign in as me on another device". It uses the same public subpath exports the bundled plugins use:

```ts
import { randomBytes, createHash } from "node:crypto";
import type { AuthFnPlugin, AuthFnPluginRuntimeContext } from "authfn";
import {
  AuthFnError,
  AuthFnNotFoundError,
  AuthFnUnauthenticatedError,
  AuthFnValidationError,
} from "authfn";
import { authenticateRequest, issueSession } from "authfn/core/sessions";
import { createAuthFnRouteMeta, readOptionalJson } from "authfn/http/router";
import { jsonSuccess, resolveRequestId } from "authfn/http/envelopes";

const TABLE = "magic_links";
const MAGIC_LINK_TTL_SECONDS = 5 * 60;

export type MagicLinkRuntimeConfig = {
  onIssued?: (event: {
    requestId?: string;
    userId: string;
    ttlSeconds: number;
  }) => Promise<void> | void;
};

export function magicLinkPlugin(): AuthFnPlugin<"magicLink", MagicLinkRuntimeConfig> {
  return {
    name: "magicLink",
    schema: () => [
      {
        modelName: TABLE,
        fields: {
          id: { type: "string", required: true, fieldName: "id" },
          userId: { type: "string", required: true, fieldName: "user_id" },
          codeHash: { type: "string", required: true, fieldName: "code_hash" },
          expiresAt: { type: "date", required: true, fieldName: "expires_at" },
          consumedAt: { type: "date", required: false, fieldName: "consumed_at" },
          createdAt: { type: "date", required: true, fieldName: "created_at" },
        },
        indexes: [
          { name: "idx_magic_links_code_hash", fields: ["codeHash"], unique: true },
        ],
      },
    ],
    routes: (ctx) => createRoutes(ctx),
  };
}

function createRoutes(ctx: AuthFnPluginRuntimeContext) {
  return [
    {
      method: "POST" as const,
      path: "/magic/issue",
      meta: createAuthFnRouteMeta(
        "issueMagicLink",
        "Issue a one-time magic-link code",
        { mode: "cookie-session" },
      ),
      handler: async (request: Request) => {
        const session = await authenticateRequest(ctx.config, request);
        if (!session) throw new AuthFnUnauthenticatedError();

        const code = randomBytes(16).toString("base64url");
        const codeHash = createHash("sha256").update(code).digest("hex");
        const expiresAt = new Date(
          Date.now() + MAGIC_LINK_TTL_SECONDS * 1000,
        );

        await ctx.config.database.create({
          model: TABLE,
          data: {
            id: randomBytes(8).toString("hex"),
            userId: session.actorId,
            codeHash,
            expiresAt,
            createdAt: new Date(),
          },
          namespace: ctx.namespace,
        });

        const magicLinkRuntime = ctx.config.pluginRuntime?.magicLink as
          | MagicLinkRuntimeConfig
          | undefined;
        await magicLinkRuntime?.onIssued?.({
          requestId: resolveRequestId(request),
          userId: session.actorId,
          ttlSeconds: MAGIC_LINK_TTL_SECONDS,
        });

        return jsonSuccess(request, { code, expiresAt });
      },
    },
    {
      method: "POST" as const,
      path: "/magic/redeem",
      meta: createAuthFnRouteMeta(
        "redeemMagicLink",
        "Redeem a one-time magic-link code and issue a session",
        { mode: "none" },
      ),
      handler: async (request: Request) => {
        const body = await readOptionalJson<{ code?: string }>(request);
        if (!body.code) throw new AuthFnValidationError("code is required");
        const codeHash = createHash("sha256").update(body.code).digest("hex");

        const row = await ctx.config.database.findOne({
          model: TABLE,
          where: [{ field: "codeHash", operator: "eq", value: codeHash }],
          namespace: ctx.namespace,
        });

        if (!row) throw new AuthFnNotFoundError("magic link unknown");
        if (row.consumedAt) {
          throw new AuthFnError("AUTHFN_OTP_REPLAYED", "already used", { status: 409 });
        }
        if (row.expiresAt < new Date()) {
          throw new AuthFnError("AUTHFN_OTP_EXPIRED", "expired", { status: 400 });
        }

        await ctx.config.database.update({
          model: TABLE,
          where: [{ field: "id", operator: "eq", value: row.id }],
          data: { consumedAt: new Date() },
          namespace: ctx.namespace,
        });

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: row.userId,
          // AuthFnAuthMethod is a closed public union. This email-delivered
          // one-time credential uses the supported email-otp method.
          methods: ["email-otp"],
        });

        return jsonSuccess(request, { session: issued.session });
      },
    },
  ];
}
```

Enable it like any other plugin:

```ts
import { authfn, authFnPlugins } from "authfn";

const authApp = authfn({
  plugins: authFnPlugins(magicLinkPlugin()),
});

const auth = authApp.createServer({
  database,
  pluginRuntime: {
    magicLink: {
      onIssued: (event) => magicLinkTelemetry.record(event),
    },
  },
});
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
  config: AuthFnRuntimeConfig;
  namespace: string;                 // your kernel's namespace
  basePath: string;                  // typically '/auth'
  hooks: Partial<AuthFnHooks>;       // composed kernel + plugin hooks
  environment?: AuthFnEnvironmentResolver;
}
```

Your routes receive `ctx` from the plugin runner. Use `ctx.namespace` when reading/writing through the database adapter; never hardcode `'authfn'`. `ctx.config` is the **runtime** config (database, stores, pluginRuntime, observability), not the side-effect-free app declaration.

If your plugin needs secrets or delivery providers, declare a runtime config type on `AuthFnPlugin<TName, TRuntimeConfig, TRuntimeRequired>` and read it from `ctx.config.pluginRuntime` the same way bundled plugins do. Pass those values through `createServer({ pluginRuntime })`, not through `authfn()`.

## Schema descriptor

The kernel composes your `schema(config)` with everything else. Your tables are real database tables — they need migrations like any other. After enabling your plugin, run:

```bash
npx @superfunctions/cli generate-schema --adapter drizzle --dialect postgres --output ./db/generated
```

Then use your ORM's migration tool (for example, `drizzle-kit generate`) and
ship the migration alongside your code. `authApp.getSchema()` works without
`createServer()`.

## Routes

The kernel reads:

- `method`: HTTP method.
- `path`: relative to the kernel's `basePath`.
- `meta`: from `createAuthFnRouteMeta(operationId, summary, { mode, csrf? })`.
- `handler`: `(Request) => Promise<Response>`.

`mode` is `'none' | 'cookie-session' | 'bearer' | 'hybrid'`. Throw `AuthFnError` (or a subclass) for failures. The kernel converts to envelopes and emits `authfn.request.failed`. Return `jsonSuccess(request, data)` so the envelope includes the request id.

## Hooks

Plugins can register hooks:

```ts
{
  name: "analytics",
  hooks: {
    afterUserCreate(ctx, user) { trackUserCreated(user.id); },
  },
  hookFailurePolicy: { afterUserCreate: "observe" },
}
```

Hook ordering: plugin `before*` (in plugin order) → kernel `before*` → handler →
plugin `after*` → kernel `after*`. See [Concepts → Hooks](../core-concepts/hooks).

## Observability

`emitAuthEvent` accepts the closed public `AuthFnEventType` union. It is useful
when a custom plugin emits one of the kernel's standard events; it does not
accept arbitrary custom event names. For plugin-specific telemetry, call an
application-owned reporter supplied in your plugin's runtime config, as the
`/magic/issue` route above does.

Keep the reporter's event type in your plugin package. Do not cast a freeform
string into `AuthFnEventType`; sinks consuming kernel events can rely on that
union being exhaustive.

## OpenAPI integration

`createAuthFnRouteMeta` is what the OpenAPI generator reads. Setting `operationId` and `summary` is sufficient for the route to show up in `auth.openApi()`. Request/response schemas are not yet declared in the bundled plugins; the same is true for custom plugins — at the moment, the OpenAPI surface is paths + operations.

## Validation

Use `validateConfig(config)` to fail fast when the server is created:

```ts
{
  name: "my-plugin",
  validateConfig(config) {
    const present = config.plugins.some((p) => p.name === "twoFactor");
    if (!present) {
      throw new AuthFnConfigError("my-plugin requires twoFactor to be enabled");
    }
  },
}
```

## Testing

Plugins can be unit-tested by:

1. Declaring an app with `authfn({ plugins: authFnPlugins(yourPlugin()) })`.
2. Creating a server with `memoryAdapter` from `@superfunctions/db/testing`.
3. Calling `auth.router.fetch(<Request>)` directly.
4. Asserting on the response envelope.

The bundled plugins follow this pattern; see `authfn/core/src/__tests__/*.test.ts` for examples.

## Publishing

Plugins are just npm packages. Publish under your scope; consumers install and add to their `plugins` array. Document:

- The factory function signature and which options belong in `pluginRuntime`.
- The schema tables and any required migrations.
- The routes and operation ids.
- The events emitted.
- The errors thrown.

## Related

- [Concepts → Plugins](../core-concepts/plugins)
- [Concepts → Hooks](../core-concepts/hooks)
- [Concepts → Errors](../core-concepts/errors)
- [Concepts → Observability](../core-concepts/observability)
- [SDKs → authfn](../sdk/core)
