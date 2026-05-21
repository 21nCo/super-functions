---
title: Envelopes
description: The shape of every authfn HTTP response — success and error.
---

# Envelopes

Every authfn response uses one of two envelopes. They're stable across plugins, and the SDKs depend on them.

## Success

```ts
{
  ok: true,
  data: T,                  // operation-specific
  requestId: string,        // matches the X-Request-Id response header
  meta?: Record<string, unknown>;   // optional: pagination cursors, deprecation hints
}
```

Examples:

```jsonc
// signInWithPassword
{
  "ok": true,
  "data": {
    "session": {
      "id": "session_...",
      "userId": "user_...",
      "expiresAt": "2025-06-01T12:00:00.000Z",
      "methods": ["password"],
      "lastAuthenticatedAt": "2025-05-21T08:00:00.000Z"
    }
  },
  "requestId": "req_..."
}
```

```jsonc
// listSessions
{
  "ok": true,
  "data": {
    "sessions": [ /* ... */ ]
  },
  "requestId": "req_..."
}
```

## Error

```ts
{
  ok: false,
  error: {
    code: AuthFnErrorCode,        // stable string union
    message: string,              // human-readable; not localized
    retryable: boolean,
    details?: Record<string, unknown>;   // structured per code
  };
  requestId: string;
}
```

Examples:

```jsonc
// AUTHFN_2FA_REQUIRED
{
  "ok": false,
  "error": {
    "code": "AUTHFN_2FA_REQUIRED",
    "message": "Two-factor authentication required",
    "retryable": true,
    "details": { "challengeId": "ch_..." }
  },
  "requestId": "req_..."
}
```

```jsonc
// AUTHFN_VALIDATION_ERROR
{
  "ok": false,
  "error": {
    "code": "AUTHFN_VALIDATION_ERROR",
    "message": "Validation failed",
    "retryable": false,
    "details": { "fields": { "email": "must be a valid email" } }
  },
  "requestId": "req_..."
}
```

## Status codes

The envelope shape is the same for `2xx` (success) and `4xx`/`5xx` (error). The HTTP status mirrors `error.code`'s mapped status — so `AUTHFN_VALIDATION_ERROR` is `400`, `AUTHFN_UNAUTHENTICATED` is `401`, `AUTHFN_RATE_LIMITED` is `429`, and so on. See [errors](./errors).

## Headers

| Header | Meaning |
| --- | --- |
| `X-Request-Id` | Mirrors `requestId` in the body. Useful for log correlation. |
| `X-Authfn-Region` | Region id that handled the request (multi-region only). |
| `Set-Cookie: authfn_session=...; ...` | Set after a successful sign-in or refresh. |
| `Set-Cookie: authfn_csrf=...` | Companion CSRF cookie. |
| `Cache-Control: no-store, no-cache` | Set on every authfn response — never cache. |

## Helpers

```ts
import { jsonSuccess, jsonError } from '@authfn/core';

return jsonSuccess({ session });
return jsonError(new AuthFnValidationError('bad email', { fields: { email: '...' } }));
```

Plugin authors should always use these — they keep the envelope shape consistent and emit the canonical headers.
