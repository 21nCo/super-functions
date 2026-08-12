---
title: Configuration
description: Every option you can pass to createAuthFn.
---

# Configuration

```ts
const auth = createAuthFn({
  // Required
  database,                 // an @authfn/core-compatible adapter
  plugins,                  // your plugin array

  // Strongly recommended
  namespace,                // table prefix; defaults to 'authfn'
  baseUrl,                  // canonical absolute URL; required for OAuth + multi-region
  basePath,                 // path the kernel mounts under; defaults to '/auth'

  // Cookies
  cookie: {
    name,                   // 'authfn_session' by default
    domain,                 // optional
    sameSite,               // 'lax' (default), 'strict', or 'none'
    secure,                 // true in production
    path,                   // '/'
  },
  csrf: {
    enabled,                // true
    headerName,             // 'X-CSRF-Token'
    cookieName,             // 'authfn_csrf'
  },

  // Session lifetimes
  session: {
    expiresIn,              // ms; default 30d
    refreshOn: 'authentication' | 'access',
    refreshThreshold,       // ms; default 7d
  },

  // Account linking
  accountLinking: {
    oauthByVerifiedEmail,           // boolean | { requireExistingEmailVerified }
    passwordForAuthenticatedUser,   // boolean | { requireExistingEmailVerified }
    otpSignUpExistingUser,          // boolean | { requireExistingEmailVerified }
  },

  // Hooks
  hooks: {
    beforeUserCreate,
    afterUserCreate,
    beforeSessionIssue,
    afterSessionIssue,
    beforeAccountDelete,
    afterAccountDelete,
  },
  hookFailurePolicy: {
    afterUserCreate: 'observe' | 'fail',          // default 'fail' for before*, 'fail' for after*
    afterSessionIssue: ...,
    // ... per-hook
  },

  // Observability
  observability: {
    emit(event) { ... }
  },

  // Rate limiting
  rateLimit: {
    enabled,
    store,                  // AuthFnRateLimitStore
    routes: { ... },
  },

  // Schema
  schema: {
    tableNames,             // override emitted table names
  },

  // OpenAPI
  openApi: {
    title,
    version,
    description,
    servers: [{ url, description }],
    tags,
  },
});
```

## `database`

Any database adapter that implements the authfn contract:

- `@superfunctions/db/adapters/memory` — for tests.
- `@superfunctions/db/adapters/postgres` — production Postgres.
- `@superfunctions/db/adapters/sqlite`, `@superfunctions/db/adapters/drizzle`, etc.

See [adapters → database](../adapters/database).

## `plugins`

An array of `AuthFnPlugin` instances. Each plugin contributes routes, schema, hooks, and OpenAPI surface. See [plugins](../plugins).

## `namespace`

String — the table prefix. Defaults to `'authfn'`. Multiple authfn deployments in the same DB use distinct namespaces (e.g., `authfn_internal`, `authfn_external`).

## `baseUrl` / `basePath`

`baseUrl` is the canonical externally-facing origin (`https://api.example.com`); `basePath` is the path under that origin (`/auth`). The kernel uses these to mint OAuth `redirect_uri`s, set cookie domains, and emit OpenAPI servers.

## `cookie` / `csrf`

See [concepts → cookies](../core-concepts/cookies) and [concepts → CSRF](../core-concepts/csrf).

## `session`

See [concepts → sessions](../core-concepts/sessions).

## `accountLinking`

See [concepts → account linking](../core-concepts/account-linking).

## `hooks` / `hookFailurePolicy`

See [concepts → hooks](../core-concepts/hooks).

## `observability`

See [concepts → observability](../core-concepts/observability).

## `rateLimit`

See [concepts → rate limiting](../core-concepts/rate-limiting).

## `schema.tableNames`

```ts
schema: {
  tableNames: {
    users: 'app_users',
    sessions: 'app_sessions',
    // ...
  },
},
```

Use sparingly — every adapter, every example, every test assumes the defaults.

## `openApi`

```ts
openApi: {
  title: 'AcmeApp Auth API',
  version: '1.0.0',
  description: 'Authentication for AcmeApp',
  servers: [{ url: 'https://api.example.com', description: 'production' }],
  tags: [{ name: 'auth', description: 'authentication operations' }],
}
```

The kernel composes the spec from your plugins; this just labels it. See [concepts → openapi](../core-concepts/openapi).
