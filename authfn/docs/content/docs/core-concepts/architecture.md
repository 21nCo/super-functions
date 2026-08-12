---
title: Architecture
description: How the authfn kernel, plugins, hooks, runtime resolver, and database adapter fit together.
---

# Architecture

authfn is small at the core. The kernel is `createAuthFn(config)` — it composes a database adapter, a plugin set, hooks, a runtime resolver, and an observability sink into a single value with three things attached:

```ts
interface AuthFnInstance {
  router: Router;                                       // mount on your HTTP framework
  provider: AuthProvider<AuthFnSession>;                // authenticate a Request
  getSchema(): AuthFnSchemaDefinition;                  // emit DB schema for migrations
  openApi?(): Record<string, unknown>;                  // OpenAPI 3.1 doc
}
```

Everything else is a plugin or a hook. There is no global state, no module-level singleton, and no opinionated middleware. The kernel itself is portable across Node, Bun, Deno, Cloudflare Workers, and anywhere else WHATWG `Request` is available.

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
    plugins --> runtime[Runtime resolver]
    plugins --> obs[Observability emit]
    plugins --> cache[(Optional cache adapter)]
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
3. **Runtime resolution.** authfn calls the configured `runtime.resolve(request)` (see [Runtime](./runtime)) to determine the issuer, base URL, region, OAuth credentials, and cookie domain for this specific request.
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
| Mail delivery | — | `delivery.send` callback |
| OAuth client IDs / secrets | — | configuration |
| Authorization (admin gates, custom RBAC) | — | hooks + your code |
| Rate limiting | — | external (your gateway / WAF) |
| Audit log target | — | `observability.emit` |

## Source layout

The `@authfn/core` package is organized like this:

```
src/
  index.ts                   # createAuthFn, the public entrypoint
  schema.ts                  # AuthFnInstance.getSchema()
  openapi.ts                 # AuthFnInstance.openApi()
  plugin-runner.ts           # plugin resolution, validation, route assembly
  plugin-types.ts            # AuthFnBundledPluginDescriptor wrappers
  schema-plugin-descriptors.ts
  http/                      # http-level helpers (envelope, headers)
  core/
    cookies.ts               # cookie name + policy resolution
    sessions.ts              # session manager (issue, refresh, revoke)
    runtime.ts               # runtime resolver
    regions.ts               # region lookup table + overlays
    api-keys.ts              # API key authentication
    observability.ts         # event redaction + emit
    users.ts                 # user lookup helpers
    errors.ts                # canonical error classes + AuthFnErrorCode
    session-responses.ts     # cookie-bundled response builders
  plugins/
    password.ts
    email-otp.ts
    social-oauth.ts
    api-keys.ts
    two-factor.ts
    multi-region.ts
    native-handoff.ts
```

You can import directly from `@authfn/core` for everything public; nothing under `core/*` is re-exported because plugins are expected to express themselves through the kernel's routes and hooks rather than its internals.

## Cross-language parity

The Node kernel and the Python kernel ship the same routes, envelopes, error codes, OAuth flows, and OpenAPI document. A client written against one will work against the other. The same is true of the Swift client — it speaks the same HTTP contract, just over bearer tokens instead of cookies.

Wire-level parity is enforced by the test suites (`@authfn/core` snapshots its OpenAPI doc; the Python kernel diffs against the Node spec; the Swift client tests run against a synthetic Node server).

If you're maintaining a port to a third language, the contract surface you need to implement is fully described under [Reference](../reference) — every route, every event, every error code, every envelope shape.
