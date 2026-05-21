---
title: Envelopes
description: The success and error wrapper every filefn route returns.
---

# Envelopes

Every filefn JSON response uses one of two envelopes.

## Success

```jsonc
{
  "ok": true,
  "data": { /* ... payload ... */ }
}
```

The shape of `data` varies per route. See [Routes](./routes) for per-endpoint shapes.

Examples:

```json
{
  "ok": true,
  "data": {
    "uploadSessionId": "ups_2cd9...",
    "uploadMode": "multipart-signed-url",
    "chunkSizeBytes": 5242880,
    "totalParts": 12,
    "storageKey": "tenant-acme/images/file_xxx/version_yyy/avatar.png",
    "expiresAt": "2026-05-22T11:30:00Z",
    "uploadSessionToken": "upls_live_...",
    "fileId": "file_xxx"
  }
}
```

## Error

```jsonc
{
  "ok": false,
  "error": {
    "code": "FILEFN_POLICY_NOT_FOUND",
    "message": "Policy 'public-image' not found",
    "details": { "policy": "public-image" }
  }
}
```

`code` is the canonical `FILEFN_*` string. `message` is human-readable. `details` is optional structured context (always JSON-safe).

## HTTP semantics

- 2xx → `{ ok: true, data }`.
- 4xx / 5xx → `{ ok: false, error }`.
- The HTTP status code is *also* the `error.status` field — clients can switch on either.

## Streaming responses

Routes that stream binary content (download proxy, share download proxy, artifact download proxy) don't use envelopes. They return raw bytes with appropriate `Content-Type` and `Content-Disposition` headers.

## Custom errors

If you implement a custom `Authorizer` or `QuotaProvider` and want to throw a typed error, throw `FileFnError`:

```ts
import { FileFnError, ErrorCodes } from "@filefn/server";

throw new FileFnError(
  ErrorCodes.FORBIDDEN,
  "Cross-tenant access denied",
  403,
  { fileId, tenantId, principalTenantId }
);
```

The kernel converts it to the standard error envelope. Other thrown values become `FILEFN_INTERNAL_ERROR` with the original message redacted.

## Type-safe consumption

```ts
import type { FileFnEnvelope } from "@filefn/server";

type Envelope<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: string; message: string; details?: Record<string, unknown> } };
```

`@filefn/client` already unwraps envelopes for you — every method returns the success payload or throws `FileFnHttpError`.

## See also

- [Errors](./errors) — the error code reference.
