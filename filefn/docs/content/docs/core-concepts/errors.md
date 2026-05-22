---
title: Errors
description: filefn's canonical error envelope and the full error code catalog.
---

# Errors

Every error response from filefn follows the same envelope:

```json
{
  "ok": false,
  "requestId": "req_…",
  "error": {
    "code": "FILEFN_POLICY_NOT_FOUND",
    "message": "Policy 'public-image' not found",
    "details": { "policy": "public-image" }
  }
}
```

`code` is the machine-readable identifier. `message` is human-readable. `details` is optional, structured, and stable per code.

## Stable error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `FILEFN_AUTH_REQUIRED` | 401 | The route requires a session and `auth.resolveSession` returned `null`. |
| `FILEFN_FORBIDDEN` | 403 | The principal lacks the capability for this action. |
| `FILEFN_NOT_FOUND` | 404 | The requested resource does not exist. |
| `FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED` | 400 | The MIME type isn't on the policy's `contentTypes` allowlist. |
| `FILEFN_POLICY_MAX_SIZE_EXCEEDED` | 400 | The size exceeds the policy's `maxSizeBytes`. |
| `FILEFN_POLICY_NOT_FOUND` | 400 | The named policy isn't registered. |
| `FILEFN_QUOTA_EXCEEDED` | 402 | The configured `QuotaProvider` rejected the upload. |
| `FILEFN_RATE_LIMITED` | 429 | The route's rate limit was exceeded. `details.resetAt` tells you when to retry. |
| `FILEFN_INVALID_PART_NUMBER` | 400 | `partNumber` is not a positive integer. |
| `FILEFN_INVALID_ETAG` | 400 | The etag passed to `complete-part` is malformed. |
| `FILEFN_UPLOAD_INCOMPLETE` | 409 | `complete` was called but parts are missing. |
| `FILEFN_UPLOAD_EXPIRED` | 410 | The session TTL expired. |
| `FILEFN_UPLOAD_ABORTED` | 410 | The session was aborted. |
| `FILEFN_UPLOAD_ALREADY_COMPLETED` | 409 | `complete` was called on a session that's already closed. |
| `FILEFN_IDEMPOTENCY_CONFLICT` | 409 | Same `x-idempotency-key`, different canonical payload. |
| `FILEFN_PART_CONFLICT` | 409 | Same `partNumber` completed twice with different etags. |
| `FILEFN_UPLOAD_SIZE_MISMATCH` | 409 | The recorded total bytes don't match the declared size. |
| `FILEFN_NO_SUPPORTED_UPLOAD_MODE` | 500 | The storage adapter doesn't support any negotiable mode. |
| `FILEFN_OFFLINE_UNSUPPORTED` | 400 | OPFS isn't available in this environment. |
| `FILEFN_SESSION_NOT_FOUND` | 404 | Upload session id doesn't exist. |
| `FILEFN_SHARE_EXPIRED` | 410 | The share link's `expiresAt` has passed. |
| `FILEFN_SHARE_REVOKED` | 410 | The share link was revoked. |
| `FILEFN_SHARE_DOWNLOADS_EXCEEDED` | 410 | The share link reached `maxDownloads`. |
| `FILEFN_SHARE_NOT_FOUND` | 404 | The share token doesn't match any row. |
| `FILEFN_PERMISSION_NOT_FOUND` | 404 | Permission grant id doesn't exist. |
| `FILEFN_PROCESSING_ENQUEUE_FAILED` | 503 | The processing queue / inline runner refused. |
| `FILEFN_INVALID_RENDER_INTENT` | 400 | `intent` query param isn't `thumbnail` / `preview` / `full` / `download`. |
| `FILEFN_SESSION_TOKEN_REQUIRED` | 401 | A protected upload route was called without `x-upload-session-token`. |
| `FILEFN_SESSION_TOKEN_INVALID` | 403 | The provided session token doesn't match the session's stored hash. |

The full enum lives in `errors.ts`. Codes are `SCREAMING_SNAKE_CASE` and prefixed with `FILEFN_`.

## How clients should handle errors

`@filefn/client` wraps non-2xx responses in `FileFnHttpError`:

```ts
import { FileFnHttpError } from "@filefn/client";

try {
  await client.uploadFile({ policy: "public-image", file });
} catch (error) {
  if (error instanceof FileFnHttpError) {
    if (error.code === "FILEFN_RATE_LIMITED") {
      const retryAt = error.details?.resetAt as string | undefined;
      // schedule retry
    }
  }
}
```

The Python client and Swift client both expose a typed equivalent.

## Recovery patterns

| Scenario | Recovery |
| --- | --- |
| `FILEFN_RATE_LIMITED` | Back off until `details.resetAt`. |
| `FILEFN_UPLOAD_EXPIRED` | Re-init the session with the same idempotency key (same canonical payload → same session). |
| `FILEFN_PART_CONFLICT` | Stop. The two etags mean the same part number was used for different bytes — fix client logic. |
| `FILEFN_IDEMPOTENCY_CONFLICT` | Stop. Caller bug. Don't reuse the key with different payload. |
| `FILEFN_QUOTA_EXCEEDED` | Surface the user-facing message; ask the operator to free space. |
| `FILEFN_NO_SUPPORTED_UPLOAD_MODE` | Misconfiguration. Log and alert. |
| `FILEFN_AUTH_REQUIRED` / `FILEFN_FORBIDDEN` | Send the user back to your auth flow / show "no access" UI. |

## Why a stable, machine-readable code

Strings change. Localisation changes them more. Versions change them most of all. Codes are a contract: `FILEFN_QUOTA_EXCEEDED` means the same thing in v0.1, v1.0, and v3.0. Every SDK switches on `code`, never `message`.
