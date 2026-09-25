---
title: Architecture
description: How the authfn kernel, plugins, hooks, runtime resolver, and database adapter fit together.
---

# Architecture

authfn is small at the core. The kernel uses a two-stage API:

1. `authfn(config)` declares a side-effect-free app — plugins, schema, cookies, account-linking policy, and OpenAPI metadata.
2. `app.createServer(config)` injects runtime dependencies — database, stores, hooks, environment resolution, plugin runtime, and observability — and returns a server with a router, auth provider, and schema.

```ts
interface AuthFnApp<TPlugins> {
  config: AuthFnConfig<TPlugins>;
  getSchema(): AuthFnSchemaDefinition;
  createServer(server: AuthFnTypedServerConfig<TPlugins>): AuthFnServer;
}

interface AuthFnServer {
  router: Router;                                       // mount on your HTTP framework
  provider: AuthProvider<AuthFnSession>;                // authenticate a Request
  getSchema(): AuthFnSchemaDefinition;                  // emit DB schema for migrations
  openApi?(): Record<string, unknown>;                  // OpenAPI 3.1 doc
}
```

Everything else is a plugin or a hook. There is no global state, no module-level singleton, and no opinionated middleware. The kernel itself is portable across Node, Bun, Deno, Cloudflare Workers, and anywhere else WHATWG `Request` is available.

`app.getSchema()` is available without creating a server, so schema generation and build tooling can load the declaration without opening database or network connections.

## Layered view

```mermaid
flowchart TB
  subgraph Clients
    web[@authfn/client]
    svelte[@authfn/svelte]
    py[authfn (Python)]
    swift[AuthFnSwift]
  end

  subgraph Server[authfn server]
    direction TB
    router[Router] --> plugins[Plugins]
    plugins --> hooks[Hooks]
    plugins --> sessions[Session manager]
    sessions --> db[(Database adapter)]
    plugins --> environment[Environment resolver]
    plugins --> obs[Observability emit]
    plugins --> stores[(Optional KV stores)]
  end

  Clients -->|HTTPS| Server
  Server -->|emits| Telemetry[(Logs / metrics / audit)]
  Server -->|reads/writes| db
  obs --> Telemetry
```

## Lifecycle of a request

When a client calls authfn, the following happens:

1. **Adapter dispatch.** Your framework adapter (`@superfunctions/http-hono`, `@superfunctions/http-next`, etc.) hands authfn a `Request`.
2. **Routing.** The kernel router matches the path to a route registered by one of your enabled plugins.
3. **Environment resolution.** authfn calls the configured `environment.resolve(request)` (see [Runtime](./runtime)) to determine the issuer, base URL, region, OAuth credentials, and cookie domain for this specific request.
4. **CSRF check (if applicable).** Mutating routes mounted on cookie sessions verify a double-submit CSRF token (see [CSRF](./csrf)).
5. **Authentication (if required).** Routes that need a session call into the session manager, which reads cookies (or a bearer token), looks up the session record, runs idle/absolute timeout checks, and rotates if needed.
6. **Hook chain.** `before*` hooks run, the plugin executes, `after*` hooks run. Hook failures are either fatal or observed depending on `hookFailurePolicy`.
7. **Storage.** All durable state — users, sessions, OAuth states, OTP challenges, API keys, 2FA enrollments, region profiles, native handoff codes — goes through your single `database` adapter using the `@superfunctions/db` contract.
8. **Envelope and observability.** Every response is wrapped in an [envelope](./envelopes) with a request id; an [event](./observability) is emitted with structured metadata.

## Where authfn ends and you begin

| Concern | Owned by authfn | Owned by you |
| --- | --- | --- |
| Routes, OpenAPI, envelopes | Yes | — |
| Session storage shape | Yes | — |
| Password hashing, OTP generation, TOTP verification | Yes | — |
| Cookie issuance, CSRF | Yes | Domain/SameSite/Secure choice |
| Database write/read | — | Database adapter, migrations |
| Mail delivery | — | `pluginRuntime.emailOtp.delivery.send` (and password-reset OTP delivery) |
| OAuth client IDs / secrets | — | `pluginRuntime.socialOAuth.providers` |
| Authorization (admin gates, custom RBAC) | — | hooks + your code |
| Rate limiting | Optional `createServer({ rateLimit })` | plus your gateway / WAF |
| Audit log target | — | `observability.emit` |

## Packages

The Node kernel is the `authfn` package. Plugins are published independently and are **not** re-exported by the kernel:

| Package | Role |
| --- | --- |
| `authfn` | Kernel: `authfn()`, `createServer()`, sessions, schema, OpenAPI, errors, plugin contract |
| `@authfn/password` | `authFnPasswordPlugin` |
| `@authfn/email-otp` | `authFnEmailOtpPlugin` |
| `@authfn/social-oauth` | `authFnSocialOAuthPlugin` |
| `@authfn/api-keys` | `authFnApiKeyPlugin` |
| `@authfn/two-factor` | `authFnTwoFactorPlugin` |
| `@authfn/multi-region` | `authFnMultiRegionPlugin` |
| `@authfn/native-handoff` | `authFnNativeHandoffPlugin` |
| `@authfn/client` | Browser / Node typed client |
| `@authfn/svelte` | Svelte stores over the client |
| `@authfn/admin` | Admin-only routes |

Schema and policy options are passed to each plugin factory in `authfn({ plugins })`. Runtime dependencies such as OTP delivery, OAuth secrets, 2FA encryption keys, shared stores, and clocks are passed under `.createServer({ pluginRuntime })`.

## Cross-language parity

The Node kernel and the Python kernel ship the same routes, envelopes, error codes, OAuth flows, and OpenAPI document. A client written against one will work against the other. The same is true of the Swift client — it speaks the same HTTP contract, just over bearer tokens instead of cookies.

Wire-level parity is enforced by the test suites (`authfn` snapshots its OpenAPI doc; the Python kernel diffs against the Node spec; the Swift client tests run against a synthetic Node server).

If you're maintaining a port to a third language, the contract surface you need to implement is fully described under [Reference](../reference) — every route, every event, every error code, every envelope shape.
