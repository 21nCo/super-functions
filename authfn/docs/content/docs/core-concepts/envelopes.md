---
title: Envelopes
description: Every authfn HTTP response wraps either a success payload or a structured error in a stable envelope shape.
---

# Envelopes

authfn answers every request with one of exactly two response shapes. The contract is enforced kernel-wide and cross-language — the Node, Python, and Swift kernels emit identical envelopes.

## Success envelope

```jsonc
// HTTP/1.1 200 OK
// Content-Type: application/json
{
  "ok": true,
  "data": { /* route-specific payload */ },
  "requestId": "01HJZK0G42VV0XNEH4S6XW70AT"
}
```

```ts
interface AuthFnSuccessEnvelope<TData = Record<string, unknown>> {
  ok: true;
  data: TData;
  requestId: string;
}
```

The `data` shape is per-route and documented in the [API reference](../api). The `requestId` is also present in the `X-Request-Id` response header, propagated to every observability event for the same request, and accepted as `X-Request-Id` on the request side if you want to correlate from upstream.

## Error envelope

```jsonc
// HTTP/1.1 400 Bad Request
// Content-Type: application/json
{
  "ok": false,
  "error": {
    "code": "AUTHFN_VALIDATION_ERROR",
    "message": "email is required",
    "retryable": false,
    "details": { "field": "email" }
  },
  "requestId": "01HJZK0G42VV0XNEH4S6XW70AT"
}
```

```ts
interface AuthFnErrorEnvelope {
  ok: false;
  error: {
    code: AuthFnErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  requestId: string;
}
```

Every error code is one of the values listed in [Errors](./errors). The `retryable` flag is set on errors where retry is sane (`AUTHFN_DELIVERY_FAILED`, `AUTHFN_RATE_LIMITED`, `AUTHFN_INTERNAL_ERROR`). All other codes are `retryable: false`.

## Status codes

The HTTP status reflects the error class:

| Class | Status | Examples |
| --- | --- | --- |
| Validation, bad input | 400 | `AUTHFN_VALIDATION_ERROR`, `AUTHFN_OTP_INVALID` |
| Authentication required | 401 | `AUTHFN_UNAUTHENTICATED`, `AUTHFN_INVALID_CREDENTIALS`, `AUTHFN_SESSION_EXPIRED`, `AUTHFN_2FA_REQUIRED` |
| Forbidden | 403 | `AUTHFN_CSRF_INVALID`, `AUTHFN_EMAIL_NOT_VERIFIED` |
| Not found | 404 | `AUTHFN_NOT_FOUND`, `AUTHFN_REGION_NOT_FOUND` |
| Conflict | 409 | `AUTHFN_CONFLICT`, `AUTHFN_OTP_REPLAYED`, `AUTHFN_OAUTH_STATE_REPLAYED`, `AUTHFN_REGION_MISMATCH` |
| Rate limit | 429 | `AUTHFN_RATE_LIMITED` |
| Server | 500 | `AUTHFN_INTERNAL_ERROR`, `AUTHFN_PLUGIN_ABORTED` |
| Not implemented | 501 | `AUTHFN_NOT_IMPLEMENTED` |
| Service unavailable | 503 | `AUTHFN_DELIVERY_FAILED` |

## How clients should handle envelopes

The shape is stable, so every SDK simply reads `ok`:

```ts
const response = await fetch(/* … */);
const envelope = await response.json();
if (envelope.ok) {
  use(envelope.data);
} else {
  show(envelope.error.code, envelope.error.message);
}
```

The first-party SDKs throw a typed `AuthFnError` (Node), `AuthFnError` (Swift), or `AuthFnError` (Python) when `ok === false`. The thrown exception preserves `code`, `message`, `retryable`, and `details`.

## Request IDs

Every response carries a `requestId`. Every observability event carries the same `requestId`. Every server log line that authfn emits is prefixed with the `requestId`. This is the canonical correlation key.

If you want to honor an inbound `X-Request-Id` header (e.g. from your gateway), authfn does so transparently: the inbound header value is reused across every event and response. Otherwise the kernel generates a [ULID](https://github.com/ulid/spec) and uses that.

## Streaming and binary responses

A few routes serve non-JSON payloads:

- `GET /auth/oauth/:provider/start` — `302 Found` redirect to the upstream provider.
- `GET /auth/oauth/:provider/callback` — `302 Found` redirect back to the configured `returnTo`.
- The OpenAPI document — `application/json`, but emitted directly without an envelope (because consumers are OpenAPI tools, not API clients).

These exceptions are documented per-route in the [API reference](../api).

## Custom data fields

If you need to surface additional data (for example, a "you have N other sessions" hint after sign-in), do it through your own routes rather than mutating the kernel's envelope shape. Authoring [custom plugins](../plugins) is the supported extension path; they'll inherit the same envelope shape automatically.

## Related

- [Errors](./errors) — every error code.
- [Observability](./observability) — request id correlation.
- [API reference](../api) — per-route data shapes.
