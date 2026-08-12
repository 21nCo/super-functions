---
title: Admin
description: "@authfn/admin — admin-only routes for listing and deleting users, with a customizable authorization callback."
---

# Admin

`@authfn/admin` is a small package that mounts admin-only HTTP routes alongside your kernel. It uses the same database, the same namespace, and the same observability sink. You bring the **authorization** — a callback that decides whether a given request is allowed to perform a given admin action.

```bash
npm install @authfn/admin
```

## Setup

```ts
import { createAuthFn, authFnPasswordPlugin } from '@authfn/core';
import { createAuthFnAdmin } from '@authfn/admin';

const auth = createAuthFn({
  database,
  namespace: 'authfn',
  plugins: [authFnPasswordPlugin()],
});

const admin = createAuthFnAdmin({
  authFnConfig: auth.config,                // exposed for admin's internal use
  authorize: async (ctx, input) => {
    const provided = ctx.request.headers.get('x-admin-token');
    if (provided !== process.env.ADMIN_TOKEN) {
      return { allowed: false };
    }
    return { allowed: true, actorId: 'admin-token', metadata: { source: 'static-token' } };
  },
  basePath: '/admin',
});

// Mount in your HTTP framework alongside the main router:
import { Hono } from 'hono';
import { toHono } from '@superfunctions/http-hono';

const app = new Hono();
app.route('/auth', toHono(auth.router));
app.route('/auth/admin', toHono(admin.router));
```

## Routes

| Method | Path | Operation ID | Notes |
| --- | --- | --- | --- |
| `GET` | `/admin/users` | `listAuthFnAdminUsers` | List users with paging/search. |
| `DELETE` | `/admin/users/:userId` | `deleteAuthFnAdminUserById` | Cascading delete by user id. |
| `DELETE` | `/admin/users` | `deleteAuthFnAdminUsersByEmail` | Cascading delete by email (handles ambiguity). |

All routes use the standard authfn envelopes and emit `authfn.account.deleted` plus admin-specific observability events.

## Authorization callback

```ts
type AuthFnAdminAuthorize = (
  ctx: { request: Request; action: 'users.list' | 'users.delete' },
  input: { operationId: string; params?; query?; body? }
) => Promise<boolean | { allowed: boolean; actorId?: string; metadata?: Record<string, unknown> }>;
```

The callback runs *before* every admin operation. Return `false` (or `{ allowed: false }`) to deny — the kernel returns `AUTHFN_ADMIN_UNAUTHORIZED`. Return `true` (or `{ allowed: true, actorId, metadata }`) to allow; `actorId` and `metadata` are propagated into the observability event.

A common pattern is to **gate by an internal IAM identity** plus a per-action allowlist:

```ts
authorize: async (ctx, input) => {
  const session = await yourCorporateAuth.authenticate(ctx.request);
  if (!session) return false;

  if (input.operationId === 'deleteAuthFnAdminUsersByEmail' && !session.permissions.includes('users:delete')) {
    return false;
  }

  return { allowed: true, actorId: session.userId, metadata: { roles: session.roles } };
},
```

## Static-token authorizer

For internal tools or scripts, the bundled `staticAdminKeyAuthorizer` accepts a fixed token from a header:

```ts
import { staticAdminKeyAuthorizer } from '@authfn/admin';

createAuthFnAdmin({
  authFnConfig: auth.config,
  authorize: staticAdminKeyAuthorizer({
    token: process.env.ADMIN_TOKEN!,
    headerName: 'x-admin-token',
    actorId: 'admin-cli',
  }),
});
```

## Cascade semantics

`deleteAuthFnAdminUserById` deletes:

- the user row
- every session for that user
- every password credential, OAuth identity, OTP challenge, API key, 2FA enrollment / recovery code, region profile

…in a single transaction. The response carries per-table counts:

```jsonc
{
  "ok": true,
  "data": {
    "deleted": true,
    "userId": "user_123",
    "primaryEmail": "ada@example.com",
    "counts": { "sessions": 4, "password_credentials": 1, "oauth_accounts": 2, "api_keys": 3, "two_factor_enrollments": 1 }
  },
  "requestId": "..."
}
```

## Errors

| Code | When |
| --- | --- |
| `AUTHFN_ADMIN_UNAUTHORIZED` | `authorize` returned `false`. |
| `AUTHFN_ADMIN_AMBIGUOUS_USER` | `deleteAuthFnAdminUsersByEmail` matched multiple users; you must disambiguate by id. |
| `AUTHFN_ADMIN_CONFIG_INVALID` | Construction-time config error. |
| `AUTHFN_VALIDATION_ERROR` | Missing or malformed parameters. |

## Why a separate package?

Two reasons:

- **Authorization is your concern.** Bundling admin routes into the kernel would force a one-size-fits-all auth model. Instead, you pass an `authorize` callback and decide who's an admin.
- **Less surface, better security.** A deployment that doesn't need admin routes simply doesn't install `@authfn/admin` — the routes can't accidentally end up exposed.

## Related

- [Concepts → Errors](../core-concepts/errors)
- [Concepts → Observability](../core-concepts/observability)
- [Recipes → Building an admin tool](../recipes/admin-tool)
