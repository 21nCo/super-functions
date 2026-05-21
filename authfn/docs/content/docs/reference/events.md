---
title: Observability events
description: Every AuthFnEventType the kernel emits — when it fires and what's in its metadata.
---

# Observability events

Every interesting thing the kernel does emits an event through your `observability.emit` callback. Events have a stable shape:

```ts
type AuthFnEvent = {
  type: AuthFnEventType;
  outcome: 'success' | 'failure';
  requestId: string;
  userId?: string;
  sessionId?: string;
  regionId?: string;
  pluginId?: string;
  errorCode?: AuthFnErrorCode;
  metadata?: Record<string, unknown>;
};
```

## Catalog

| Event | When | Outcome | Useful metadata |
| --- | --- | --- | --- |
| `authfn.user.created` | A new user row was inserted. | success | `primaryEmail`, `via` (`'password'`, `'oauth-google'`, …) |
| `authfn.account_linked` | Account-linking added a credential / oauth identity to an existing user. | success | `linkedKind`, `existingUserId`, `via` |
| `authfn.account_linking.conflict` | The kernel refused to link two records and returned `AUTHFN_CONFLICT`. | failure | `existingUserId`, `attemptedVia` |
| `authfn.account.deleted` | A user was cascade-deleted (self or admin). | success | `userId`, `actorId`, `counts.{table}` |
| `authfn.password.signup.rollback_failed` | After a password sign-up cascade failed and the rollback also failed. Operator alarm. | failure | `userId`, `tableErrors` |
| `authfn.session.issued` | A new session was created. | success | `methods`, `regionId` |
| `authfn.session.revoked` | A session was revoked (sign-out, manual revoke, expiry sweep). | success | `cause` |
| `authfn.otp.sent` | An OTP was sent. | success / failure | `purpose`, `provider` |
| `authfn.otp.verified` | An OTP was verified. | success / failure | `purpose`, `errorCode` |
| `authfn.otp.signup.rollback_failed` | Same as `password.signup.rollback_failed` but for OTP-driven sign-ups. | failure | `userId`, `tableErrors` |
| `authfn.oauth.started` | OAuth `start` issued a state and redirected. | success | `provider`, `intent` |
| `authfn.oauth.completed` | OAuth callback completed and a session was issued. | success | `provider` |
| `authfn.oauth.failed` | OAuth callback didn't complete. | failure | `provider`, `errorCode` |
| `authfn.api_key.created` | An API key was issued. | success | `apiKeyId`, `scopes` |
| `authfn.api_key.revoked` | An API key was revoked. | success | `apiKeyId`, `cause` |
| `authfn.2fa.enabled` | 2FA was enrolled and confirmed. | success | `userId` |
| `authfn.2fa.challenged` | A 2FA challenge was completed (or failed). | success / failure | `errorCode` |
| `authfn.region.lookup` | A region lookup was performed. | success | `regionId`, `cacheHit` |
| `authfn.region.lookup.conflict` | Two regions raced to claim the same identifier. | failure | `loserRegionId` |
| `authfn.handoff.started` | A handoff code was issued. | success | `kind` (`native` / `web`) |
| `authfn.handoff.exchanged` | A handoff code was exchanged for a session. | success | `kind` |
| `authfn.handoff.failed` | Handoff exchange failed. | failure | `kind`, `errorCode` |
| `authfn.rate_limited` | A rate limiter rejected a request. | failure | `route`, `key`, `retryAfter` |
| `authfn.request.failed` | A request failed with a non-domain error (e.g., AUTHFN_INTERNAL_ERROR). | failure | `route`, `errorCode` |
| `authfn.plugin.failed` | A plugin's runtime hook threw outside the domain envelope. Operator alarm. | failure | `pluginId`, `phase`, `errorMessage` |

## Wiring

Wire `observability.emit` once at construction:

```ts
createAuthFn({
  // ...
  observability: {
    emit(event) {
      logger.info({ ...event });
    },
  },
});
```

For OpenTelemetry: see [recipes → OpenTelemetry instrumentation](../recipes/observability-otel).

## Source of truth

The full type union is in `authfn/core/src/types.ts` (`AuthFnEventType`). Per-event metadata shapes are documented inline at each emission site.
