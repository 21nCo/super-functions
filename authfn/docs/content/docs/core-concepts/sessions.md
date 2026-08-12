---
title: Sessions
description: How authfn issues, verifies, rotates, and revokes sessions — for cookie-based browsers and bearer-token clients alike.
---

# Sessions

A **session** is the relationship between a request and a subject (a user or an API-key holder). authfn issues one when a client successfully authenticates and verifies it on every subsequent request.

There are two transport modes:

- **Cookie sessions** for browsers. Two cookies — a session cookie (`__Secure-authfn.session` by default) and a CSRF cookie (`authfn.csrf`) — together carry the session identity and the CSRF token.
- **Token sessions** (bearer) for non-browser clients. The same `AuthFnSession` is exposed over `Authorization: Bearer <token>` for mobile, CLI, and server-to-server clients.

Both modes use the same `authfn_sessions` table and the same lifecycle — only the wire transport differs.

## Anatomy of a session

```ts
interface AuthFnSession {
  id: string;                                  // session id (stable across rotations)
  type: 'session' | 'api-key';
  subject: {
    actorId: string;
    actorType: 'user' | 'api-key';
    tenantId?: string;
    regionId?: string;
    email?: string;
    attributes?: Record<string, unknown>;
  };
  actorType: 'user' | 'api-key';
  actorId: string;                             // user id or api-key id
  tenantId?: string;
  regionId?: string;                           // present when multi-region is enabled
  methods: AuthFnAuthMethod[];                 // ['password'], ['email-otp'], ['oauth-google', 'two-factor'], …
  primaryEmail?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}
```

The persisted session record (`authfn_sessions`) carries:

- `tokenHash` — the hash of the bearer/session token. The plaintext is never stored.
- `csrfHash` — the hash of the CSRF token, for cookie sessions.
- `methods` — every authentication method that was used to issue or augment this session.
- `expiresAt` — absolute expiry.
- `revokedAt` — non-null when revoked.
- `lastAuthenticatedAt` — last sliding-window touch (used for idle timeout).
- `metadata` — anything you stash via the `beforeSessionIssue` hook.

## Issuing a session

Sessions are issued by the kernel — never directly by your code. Plugins call the kernel's session manager when authentication succeeds:

```ts
// Inside the password plugin, on a successful sign-in:
const issued = await issueSession(config, hooks, {
  request,
  userId: user.id,
  primaryEmail: user.primaryEmail,
  methods: ['password'],
  regionId: runtime.regionId,
});
```

If you author a plugin or extend an existing one, you can:

1. Mutate or augment the input by returning a value from `beforeSessionIssue`. This is your hook for adding metadata, restricting `regionId`, or applying tenant scoping.
2. React to the issued session from `afterSessionIssue` — emit your own audit event, push a record to your CRM, or warm a cache.

If `beforeSessionIssue` throws, the session is never issued and the error propagates to the client as `AUTHFN_PLUGIN_ABORTED` (or whatever you raise).

## Cookie mode

The cookie mode of authfn is built around **two cookies and CSRF double-submit**:

- `__Secure-authfn.session` — `HttpOnly`, `Secure`, `SameSite=Lax` by default. Carries the bearer token.
- `authfn.csrf` — readable from JavaScript so the SDK can echo it back as `X-CSRF-Token`.

Both cookie names, the prefix, the `Domain`, the `Secure` flag, the `SameSite` value, the `Path`, and the max-ages are configurable. See [Cookies](./cookies) for the full surface.

Mutating routes verify the CSRF token by comparing the `X-CSRF-Token` header (or `csrf-token` form field, depending on the route) against the cookie. See [CSRF](./csrf).

## Token mode

For non-browser clients, configure your client to use bearer tokens:

```ts
// @authfn/client
const client = createAuthFnClient({
  baseUrl: "https://api.example.com/auth",
  transport: { mode: "bearer" },
});
```

In bearer mode, the kernel:

- Issues sessions in response bodies (`{ ok: true, data: { session, sessionToken, csrfToken: null } }`) — the SDK stores the token in its `AuthFnCredentialStore`.
- Reads the bearer token from `Authorization: Bearer <token>`.
- Skips the CSRF check (bearer tokens are not subject to browser-driven CSRF; the trade-off is that the client must protect token storage itself).

The Swift SDK uses bearer mode by default. See [SDKs → Client → Token mode](../sdk/client#bearer-mode) and [SDKs → Swift](../sdk/swift).

## Rotation

authfn rotates session tokens on `afterSessionIssue` — every time a session is augmented (e.g. after a 2FA challenge succeeds), the underlying bearer/session token is rotated and a new pair is issued. This limits exposure if a token leaks.

Idle and absolute timeouts both apply. Defaults:

- Absolute lifetime: 7 days (`sessionMaxAgeSeconds`, configurable per cookie policy).
- Idle timeout: not enforced by default; if you want one, intercept `afterSessionIssue` and update `metadata.idleTimeoutAt`, then enforce it in your own middleware.
- CSRF token max age: matches the session cookie by default.

## Revocation

A session is revoked by setting `revokedAt`. The kernel checks `revokedAt` on every authenticated request — once revoked, the session is rejected with `AUTHFN_SESSION_REVOKED`.

Built-in revocation paths:

- `POST /auth/sign-out` — revokes the current session.
- `DELETE /auth/sessions/:id` — revokes a named session by id (from the multi-device list).
- `DELETE /auth/account` — cascades to all sessions for that user.
- Admin: `DELETE /auth/admin/users/:id` — cascades to all of that user's sessions.

You can also revoke directly from your code by calling the session manager (exposed through `auth.provider`).

## Listing & multi-device

`GET /auth/sessions` lists every active session for the authenticated user, with metadata: `methods`, `createdAt`, `lastAuthenticatedAt`, `expiresAt`, and any custom metadata you stashed.

The Svelte and Swift SDKs expose ready-made views over this list — see [SDKs → Svelte](../sdk/svelte) and the [`account-settings` example](../examples/account-settings).

## Storage shape

The `authfn_sessions` table has the following canonical columns (the exact column names depend on your adapter):

| Column | Type | Notes |
| --- | --- | --- |
| `id` | string (UUID) | session id |
| `userId` | string | foreign key to `authfn_users` |
| `tokenHash` | string | hash of the session/bearer token |
| `csrfHash` | string \| null | hash of the CSRF token (cookie sessions only) |
| `methods` | string[] / json | list of auth methods used |
| `metadata` | json | optional, you can write arbitrary JSON here |
| `expiresAt` | timestamp | absolute expiry |
| `revokedAt` | timestamp \| null | non-null when revoked |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |
| `lastAuthenticatedAt` | timestamp \| null | sliding-window touch |

Index on `userId`, `tokenHash`, `expiresAt`. Your migrations from `auth.getSchema()` will set this up — see [Adapters → Database](../adapters/database).

## API key sessions

When a request authenticates via `Authorization: Bearer ak_…` (with the API keys plugin enabled), authfn issues a synthetic session: `type: 'api-key'`, `actorType: 'api-key'`, `methods: ['api-key']`. API key sessions are not persisted in `authfn_sessions`; the API key record itself is the source of truth. Revoking the key invalidates all of its sessions immediately.

## Related

- [Cookies](./cookies) — names, domains, prefixes, SameSite, multi-region.
- [CSRF](./csrf) — what's protected, how to opt routes out, custom origins.
- [Plugins → Two-factor](../plugins/two-factor) — challenge sessions and method augmentation.
- [Plugins → API keys](../plugins/api-keys) — API key sessions in detail.
- [Recipes → Account deletion](../recipes/account-deletion) — cascading session revocation.
