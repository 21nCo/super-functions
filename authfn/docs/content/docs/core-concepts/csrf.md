---
title: CSRF protection
description: How authfn defends against cross-site request forgery, what's protected, what's exempt, and how to extend the policy.
---

# CSRF protection

authfn implements **double-submit CSRF** for every cookie-authenticated mutating request. The browser's `SameSite=Lax` cookie attribute is the first line of defense; the CSRF token is the second. Both must pass before authfn will execute a mutating route.

If you're using bearer-token sessions, CSRF does not apply — the client sends the token explicitly and isn't subject to browser-driven CSRF.

## How double-submit works

When the kernel issues a session, it writes two cookies:

- `__Secure-authfn.session` — `HttpOnly`. Carries the session bearer token. The browser sends this on every request to the matching domain.
- `authfn.csrf` — *not* `HttpOnly`. Readable by JavaScript on the same origin. Carries the CSRF token.

For mutating requests (`POST`, `PUT`, `DELETE`, `PATCH`), the client must echo the CSRF token as either:

- The `X-CSRF-Token` request header (preferred), or
- A `csrf-token` form field (for `application/x-www-form-urlencoded` and `multipart/form-data` requests).

The kernel hashes the supplied token and compares it against `csrfHash` on the session record. If they don't match, the request is rejected with **`AUTHFN_CSRF_INVALID` (HTTP 403)**.

A cross-site attacker can cause the browser to send the session cookie via, e.g., a hidden form post — but they can't read or set the CSRF cookie from another origin, so they can't include the matching token. The attack fails.

## What's protected

Every authfn-mounted mutating route is protected by default. That includes:

- `POST /auth/sign-in/*`, `/auth/sign-up/*`, `/auth/sign-out`
- `POST /auth/password/reset/*`
- `POST /auth/otp/*`
- `POST /auth/oauth/*` *initiation* (the OAuth provider callback is a `GET` and uses the OAuth state token instead)
- `POST /auth/2fa/*`
- `POST /auth/api-keys`, `DELETE /auth/api-keys/:id`
- `DELETE /auth/sessions/:id`, `DELETE /auth/account`
- Admin routes from `@authfn/admin`

Read-only routes (`GET /auth/session`, `GET /auth/sessions`, `GET /auth/account`, etc.) are not protected by CSRF — they don't change state.

## What's exempt

The following are exempt by design:

- **Bearer-token sessions.** When the request authenticates via `Authorization: Bearer …`, the kernel skips CSRF. The client owns its token; CSRF doesn't apply.
- **OAuth provider callbacks.** `GET /auth/oauth/:provider/callback` arrives as a top-level navigation from the OAuth provider. CSRF would block the entire flow. Instead the kernel verifies an opaque, signed `state` token that was issued at the start of the flow.
- **Native-handoff exchange.** The `POST /auth/native-handoff/exchange` route accepts a one-time code (the handoff code) instead of a CSRF token. The code is bound to a specific session and target.

## What the client SDK does

`@authfn/client` handles CSRF transparently:

1. After every authenticated response, it parses the `Set-Cookie` headers and remembers the CSRF token.
2. On every mutating request, it sets `X-CSRF-Token: <token>`.
3. After a session rotation (sign-in, 2FA confirmation), it picks up the new token from the response.

If you call authfn from a non-`@authfn/client` HTTP library, you have two options:

- Read the `authfn.csrf` cookie from `document.cookie` and set the `X-CSRF-Token` header manually.
- Use the `csrf-token` form field if you're posting an HTML form.

## Custom origins

CORS is your job, not authfn's — the kernel doesn't add `Access-Control-Allow-Origin` headers. Configure your framework adapter (Hono, Express, Next.js, …) to set the right CORS policy. Two things to keep in mind:

- The `Set-Cookie` headers must traverse to the client. Set `Access-Control-Allow-Credentials: true` and *do not* use a wildcard origin (`*`); list specific origins instead.
- The CSRF token must be readable from your front-end origin. If you split the front-end and authfn across `app.example.com` and `auth.example.com`, set `cookie.domain: '.example.com'`. If they're on entirely different sites, you'll need `SameSite=None` and a partitioned cookie strategy — at which point CSRF still works as long as the front-end can read the cookie.

## Disabling CSRF (don't)

There's no `disableCsrf: true` flag. If you genuinely need to skip CSRF on a path that authfn manages, mount the route through a middleware that strips the cookie or use bearer-token sessions instead. Do not patch the kernel.

## Errors

| Code | HTTP | When |
| --- | --- | --- |
| `AUTHFN_CSRF_INVALID` | 403 | Token missing, malformed, or doesn't match. |
| `AUTHFN_UNAUTHENTICATED` | 401 | No session at all (CSRF is checked after authentication). |

The `AUTHFN_CSRF_INVALID` error response carries `details: { reason: 'missing' | 'malformed' | 'mismatch' }` so you can surface a specific message in the UI.

## Related

- [Sessions](./sessions) — where the CSRF token is generated.
- [Cookies](./cookies) — names and scoping of the CSRF cookie.
- [Errors](./errors) — full error code listing.
- [Security](./security) — full threat model.
