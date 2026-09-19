---
title: Configuration
description: Every option you can pass to authfn() and app.createServer().
---

# Configuration

authfn splits configuration into two stages. Declare a side-effect-free app, then inject runtime dependencies when you create the server. See [SDKs → authfn](../sdk/core) for the typed surface.

```ts
import { authfn, authFnPlugins } from "authfn";
import { authFnPasswordPlugin } from "@authfn/password";
import { authFnEmailOtpPlugin } from "@authfn/email-otp";

const authApp = authfn({
  namespace: "authfn",          // table prefix; defaults to 'authfn'
  basePath: "/auth",            // path the kernel mounts under; defaults to '/auth'
  cookie: { /* ... */ },
  accountLinking: { /* ... */ },
  openApi: { title: "AuthFn API", version: "1.0.0" },
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
  ),
});

const auth = authApp.createServer({
  database,                     // @superfunctions/db Adapter
  stores: { kv, atomicKv },     // optional shared stores
  rateLimit: { enabled: true },
  environment: { resolve(request) { /* ... */ } },
  hooks: { /* ... */ },
  pluginRuntime: {
    emailOtp: { delivery },     // required when email-OTP is enabled
  },
  observability: {
    emit(event) { /* ... */ },
  },
});
```

Use `authFnPlugins(...)` when declaring plugins so TypeScript preserves their exact names and infers the matching `pluginRuntime` shape.

## `authfn(config)` — declaration

These options live on `AuthFnConfig`. They are safe to import from schema generation and build tooling because they do not connect to a database or provider.

### `plugins`

An array of `AuthFnPlugin` instances from the `@authfn/*` plugin packages. Each plugin contributes routes, schema, hooks, and OpenAPI surface. See [plugins](../plugins).

### `namespace`

String — the table prefix. Defaults to `'authfn'`. Multiple authfn deployments in the same DB use distinct namespaces (e.g., `authfn_internal`, `authfn_external`).

### `basePath`

Path under the origin (`/auth` by default). The kernel uses this when composing routes.

### `cookie`

See [concepts → cookies](../core-concepts/cookies). Cookie policy can also be overlaid per request by the [runtime resolver](../core-concepts/runtime).

### `accountLinking`

See [concepts → account linking](../core-concepts/account-linking).

### `openApi`

```ts
openApi: true
// or
openApi: {
  title: 'AcmeApp Auth API',
  version: '1.0.0',
}
```

When enabled, the server exposes `auth.openApi()`. The kernel composes the spec from your plugins; this just labels it. See [concepts → openapi](../core-concepts/openapi).

## `app.createServer(config)` — runtime

These options live on `AuthFnServerConfig`. The server wraps the incoming database with authfn's combined schema before any service uses it.

### `database`

Any database adapter that implements the `@superfunctions/db` `Adapter` contract:

- `@superfunctions/db/testing` / `@superfunctions/db/adapters/memory` — for tests.
- `@superfunctions/db/adapters/drizzle` — production Drizzle (Postgres, SQLite, D1, …).

See [adapters → database](../adapters/database).

### `pluginRuntime`

Runtime dependencies keyed by plugin name. Schema and policy options stay on the plugin factory; secrets, delivery, clocks, and encryption keys go here.

| Plugin | Typical `pluginRuntime` keys |
| --- | --- |
| `emailOtp` | `delivery` (required), `message`, `codeGenerator`, `now`, `challengeTtlSeconds`, `maxAttempts` |
| `password` | `otp` (password-reset delivery and challenge settings) |
| `socialOAuth` | `providers` (required), `fetcher`, `tokenHttpClient`, `now` |
| `twoFactor` | `issuer`, `encryptionKeyRef`, `encryptionKeyResolver`, TOTP window/digits/period |
| `apiKey` | `now` |
| `multiRegion` | Configure `regions`, `defaultRegionId`, `lookupStore`, and `routing` with `authFnMultiRegionEnvironment(...)`, then pass it as `environment`. |
| `nativeHandoff` | `now` |

`emailOtp` and `socialOAuth` declare required runtime config. Creating a server without those entries fails type-checking (and fails at runtime if you bypass the types).

### `stores`

Optional KV / atomic KV stores used for caching, coordination, and rate limiting. See [concepts → regions](../core-concepts/regions) and [concepts → rate limiting](../core-concepts/rate-limiting).

### `rateLimit`

Optional request rate limiting for AuthFn HTTP routes. See [concepts → rate limiting](../core-concepts/rate-limiting).

```ts
rateLimit: {
  enabled: true,
  mode: 'local',            // 'strict' | 'best-effort' | 'local'
  // Safe only when Cloudflare removes client-supplied copies of this header.
  resolveClientIp: (request) => request.headers.get('cf-connecting-ip') ?? undefined,
  policies: {
    password: { ipLimit: 10, windowSeconds: 60 },
  },
}
```

### `environment`

Per-request resolver for issuer, base URL, region, cookie overlays, and OAuth environment values. See [concepts → runtime](../core-concepts/runtime).

### `hooks`

See [concepts → hooks](../core-concepts/hooks).

### `observability`

See [concepts → observability](../core-concepts/observability).
