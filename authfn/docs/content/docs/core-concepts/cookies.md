---
title: Cookies
description: Names, prefixes, domain, SameSite, Secure, path, and max-age — every knob authfn exposes for cookie-based sessions.
---

# Cookies

authfn's cookie policy is fully configurable, but the defaults are correct for almost every deployment. Read this page when you need to:

- run authfn on a subdomain and share sessions with the apex domain (or vice versa),
- support multiple regions with different cookie domains,
- override `Secure` for local development,
- pick a different `SameSite` than `Lax`,
- change cookie names or scopes for compatibility with an existing setup.

## Cookie names

There are two cookies:

| Purpose | Default name | Notes |
| --- | --- | --- |
| Session | `__Secure-authfn.session` (when `secure=true`) or `authfn.session` | `HttpOnly`, `Secure`, `SameSite=Lax`. |
| CSRF | `authfn.csrf` | Readable from JavaScript so the client SDK can echo the token. |

The session cookie carries the bearer token; the CSRF cookie carries the double-submit token. Both names share the configured prefix; only the session cookie is `HttpOnly`.

## Configuration surface

```ts
interface AuthFnCookieConfig {
  prefix?: string;                                     // default: "authfn"
  domain?: string | (input) => string | undefined;     // default: undefined (no Domain attr)
  secure?: boolean | (request) => boolean;             // default: true
  sameSite?: 'lax' | 'strict' | 'none';                // default: 'lax'
  path?: string;                                       // default: '/'
  sessionMaxAgeSeconds?: number;                       // default: 7 days
  csrfMaxAgeSeconds?: number;                          // default: matches session
}
```

Pass it to `createAuthFn`:

```ts
createAuthFn({
  // ...
  cookie: {
    prefix: 'app',                          // → __Secure-app.session, app.csrf
    domain: '.example.com',                 // share across api.example.com and app.example.com
    secure: (request) => new URL(request.url).hostname !== 'localhost',
    sameSite: 'lax',
    sessionMaxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
  },
});
```

## Secure

The `__Secure-` cookie name prefix is automatically applied when `secure=true`. This is required by browsers and ensures the cookie cannot be set or read over an insecure connection. When `secure=false`, the prefix is stripped (`authfn.session`).

Pass a function for `secure` if you want to enable HTTPS-only cookies in production while keeping `localhost` development working:

```ts
secure: (request) => new URL(request.url).hostname !== 'localhost',
```

## Domain

By default authfn issues cookies for the host that served the response and does not set a `Domain` attribute. To share sessions across subdomains, set:

```ts
domain: '.example.com',
```

For multi-region setups where each region uses a different cookie domain, pass a function:

```ts
domain: ({ request, regionId }) => {
  switch (regionId) {
    case 'us-east-1': return '.us.example.com';
    case 'eu-west-1': return '.eu.example.com';
    default:          return undefined;
  }
},
```

Or — preferred — use the [runtime resolver](./runtime) to set `cookie.domain` per request. Anything in `runtime.cookie` takes precedence over `config.cookie`.

## SameSite

- `'lax'` (default) — cookies are sent on top-level navigation. This is what you want for almost every web app.
- `'strict'` — cookies are *only* sent for same-site requests. This breaks any cross-site sign-in flow including OAuth callbacks. Use only if you fully control all entry points.
- `'none'` — required for cross-site iframes and some bridged native flows. Forces `Secure=true` per browser policy. Use only when you know you need it.

## Path

By default cookies are scoped to `/`. If your authfn server is mounted at a sub-path (e.g. `/api/auth`), you can scope cookies to that prefix:

```ts
path: '/api',
```

Note that the path determines which routes browsers will send cookies to. If you scope to `/api/auth`, the rest of your app at `/dashboard` will never see the session cookie.

## Max age

Two knobs:

- `sessionMaxAgeSeconds` — absolute expiry of the session cookie. Default: 7 days.
- `csrfMaxAgeSeconds` — absolute expiry of the CSRF cookie. Default: matches `sessionMaxAgeSeconds`.

These are *cookie* max-ages — they don't override the session record's `expiresAt`. The session record is the source of truth; the cookie is the transport. Setting a long cookie max-age while keeping the session record short doesn't extend the session.

## Cookie rotation

When the kernel rotates a session token (after a 2FA challenge, after `afterSessionIssue` augments the session), it issues fresh cookies in the same response. The browser writes them in place; no client action is needed.

Cookies are also cleared on `POST /auth/sign-out` and on session expiry/revocation by setting both cookies' `Max-Age=0` and `Expires=epoch`.

## Multi-region cookie domains

In a multi-region setup with region-scoped cookie domains (`.us.example.com`, `.eu.example.com`), the right region for a request is decided by the [region lookup](./regions). The runtime resolver then sets `cookie.domain` per request so the session cookie is bound to that region's authority. Wrong-authority requests are answered with `AUTHFN_REGION_MISMATCH` and a redirect target — the client follows the redirect, lands on the right authority, and acquires the right cookie.

This means your runtime resolver is the single place where region-aware cookies live; the cookie module just consumes whatever the resolver decided.

## Reading cookies on the server

If you mount authfn behind your own middleware (e.g. a request logger) and need to read the session, do it through `auth.provider.authenticate(request)`. Don't parse cookies yourself — the cookie name depends on the prefix, the `Secure` flag, and the runtime resolver:

```ts
const session = await auth.provider.authenticate(request);
if (!session) {
  // unauthenticated
}
```

## Common patterns

### Sharing sessions between `app.example.com` and `api.example.com`

```ts
cookie: {
  domain: '.example.com',
  sameSite: 'lax',
}
```

### A localhost dev server with HTTPS in production

```ts
cookie: {
  secure: (request) => !new URL(request.url).hostname.endsWith('.local'),
}
```

### Branded cookie names

```ts
cookie: { prefix: 'acme' }   // → __Secure-acme.session, acme.csrf
```

### Cross-site iframe sign-in

```ts
cookie: { sameSite: 'none' }   // requires HTTPS; partitioned cookies in newer browsers
```

## Related

- [Sessions](./sessions) — what the cookie carries.
- [CSRF](./csrf) — why there are two cookies.
- [Runtime](./runtime) — per-request overlays.
- [Regions](./regions) — multi-region cookie domains.
