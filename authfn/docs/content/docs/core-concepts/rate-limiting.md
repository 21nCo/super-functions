---
title: Rate limiting
description: What authfn does and doesn't enforce, and how to add the limits you need.
---

# Rate limiting

authfn does **not** ship a rate-limiter. Rate limiting belongs at the edge of your platform — a CDN, a WAF, a gateway — where it can be enforced consistently across every service, with deterministic counters, and where it can deny traffic before any application code runs.

This page documents what authfn *does* expose so you can wire your limiter to the right surface.

## What authfn already enforces

A handful of routes have built-in protections that aren't traditional rate limits but serve a similar purpose:

- **OTP attempt counter.** Each OTP challenge tracks `attemptCount`. After a small number of failed verifications (per the plugin's config), the challenge is invalidated.
- **OAuth state replay.** OAuth states are one-shot. Replaying the same state returns `AUTHFN_OAUTH_STATE_REPLAYED` and the request is rejected without further processing.
- **Native handoff codes.** One-time, short TTL.

These protect against logical replay attacks but do not protect against high-volume probing or credential stuffing.

## What you should rate-limit

The following routes are sensitive enough to want explicit limits:

| Route | Limit by | Rationale |
| --- | --- | --- |
| `POST /auth/sign-in/password` | IP + email | Credential stuffing, brute force. |
| `POST /auth/sign-up/password` | IP | Mass account creation. |
| `POST /auth/otp/start` | IP + email | OTP-bombing attacks against a victim's inbox. |
| `POST /auth/oauth/:provider/start` | IP | Provider-side abuse / quota burn. |
| `POST /auth/2fa/challenge` | IP + user | Brute force on the second factor. |
| `POST /auth/api-keys` | IP + user | Mass key creation. |
| `DELETE /auth/account` | IP + user | Repeated cascade-delete abuse. |
| `POST /auth/password/reset/start` | IP + email | Reset-link spam. |

## How to enforce limits

Three good options, in increasing order of integration with authfn:

### Option 1: Edge-layer limiter

Cloudflare WAF rate limit rules, AWS WAF, fastly, your reverse proxy. Match on path, source IP, and for some routes a JSON-body field (`email`). This is the lowest-overhead option and works regardless of how authfn is deployed.

### Option 2: Middleware in front of authfn

Wrap your framework's authfn mount with a rate-limiting middleware. With Hono, for example:

```ts
import { rateLimiter } from 'hono-rate-limiter';

app.use('/auth/sign-in/*', rateLimiter({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (c) => `${c.req.header('x-forwarded-for')}:${c.req.path}`,
}));

app.route('/auth', toHono(auth.router));
```

When the limit is exceeded, return a 429 with `Retry-After`. The first-party SDKs surface `AUTHFN_RATE_LIMITED` whether the kernel or your middleware emits it.

### Option 3: Custom plugin or hook

If your limiter needs to know about plugin-specific context (e.g. the resolved `userId` after sign-in), use a `before*` hook to enforce a per-actor limit:

```ts
import { AuthFnRateLimitedError } from '@authfn/core';

createAuthFn({
  // ...
  hooks: {
    async beforeSessionIssue(ctx, input) {
      const ok = await limiter.consume(`session:${input.userId}`, 5, 60_000);
      if (!ok) {
        throw new AuthFnRateLimitedError('Too many sign-ins; try again in a minute', {
          retryAfterMs: 30_000,
        });
      }
    },
  },
});
```

The kernel will translate the throw into a `429 AUTHFN_RATE_LIMITED` envelope with `details.retryAfterMs` carried through.

## How clients should behave

`@authfn/client`, the Python SDK, and `AuthFnSwift` all handle `AUTHFN_RATE_LIMITED` by:

1. Reading `details.retryAfterMs` if present.
2. Surfacing a typed `AuthFnError` (or its language equivalent) with `code === 'AUTHFN_RATE_LIMITED'`.
3. Letting the caller decide whether to back off and retry.

Show the user a "wait a minute and try again" message; don't auto-retry on the user's behalf without a backoff strategy.

## Multi-region and rate limiting

If you're multi-region and want a shared global limit (so that a credential-stuffing campaign hitting both `api.us` and `api.eu` is throttled in aggregate), use a globally-replicated counter store: Cloudflare D1 with replicas, AWS DynamoDB Global Tables, Redis with cross-region streams. Per-region limits without cross-region awareness are easier but won't catch a coordinated attacker.

## Observability

Every `429` response emits `authfn.rate_limited`. The event carries `metadata` with the route, the limiter that fired, and any `retryAfterMs`.

## Related

- [Errors](./errors) — `AUTHFN_RATE_LIMITED`.
- [Observability](./observability) — `authfn.rate_limited` event.
- [Security](./security) — full threat model.
- [Hooks](./hooks) — `beforeSessionIssue` and others.
