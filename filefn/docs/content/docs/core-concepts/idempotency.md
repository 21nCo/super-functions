---
title: Idempotency
description: How filefn deduplicates upload-init calls and prevents accidental duplicate sessions.
---

# Idempotency

`POST /upload/init` is the only filefn endpoint where retries can produce wrong results — if a network blip causes the same init to run twice, you'd end up with two sessions, two `fileId`s, and two storage objects for the same logical upload.

filefn solves this with `x-idempotency-key`.

## How it works

Pass the header on `init`:

```http
POST /filefn/upload/init
x-idempotency-key: f9f1e51a-9a76-4c0a-9f96-3a5e1cdd2a8b
```

The server:

1. Computes a stable hash of the canonical request payload (`policy + fileName + size + mimeType + metadata`, sorted keys).
2. Looks up `uploadSessions` by `(idempotencyKey, ownerId, tenantId)`.
3. If a row exists with the **same** payload hash → return the existing session.
4. If a row exists with a **different** payload hash → fail with `FILEFN_IDEMPOTENCY_CONFLICT`.
5. Otherwise → create a new session and store the key + hash.

The window is the upload-session TTL. Re-using a key after the session expires creates a new session.

## What's in the payload hash

```ts
{
  policy: string,
  fileName: string,
  size: number,
  mimeType: string,
  metadata: Record<string, JSONValue> | undefined,
}
```

`metadata` keys are sorted before hashing. `metadata: undefined` and `metadata: {}` hash identically.

## Why this matters

- **Accidental double-clicks** — a user double-clicks the upload button. Both requests hit `/upload/init`. Without idempotency, you get two sessions. With it, both clients converge on the same session.
- **Mobile network blips** — the client sent the request, the server processed it, the response was lost. The client retries with the same key. The server returns the cached session.
- **OPFS-staged offline retries** — the offline pipeline retries with a stable key for the staged upload.

## When *not* to set the key

If you legitimately want two distinct uploads of the same content (e.g. backing up the same file twice), don't reuse the key. The default behaviour is to mint a fresh session per init request when no key is sent.

## Bundled clients

`@filefn/client`, the Python client, and the Swift client all generate stable idempotency keys per `uploadFile(...)` call automatically. You can override:

```ts
client.uploadFile({
  policy: "public-image",
  file,
  idempotencyKey: "deterministic-key-from-your-app",
});
```

Useful when your app has its own retry logic and wants to stitch retries to a particular logical upload.

## Idempotency vs. dedup

These are different.

- **Idempotency** prevents accidental duplicate *sessions*. It runs at the protocol layer.
- **Dedup** (when `dedup.enabled`) prevents accidental duplicate *storage objects*. It runs at the file-version layer, scoped per policy / tenant. See [Dedup](./dedup).

You generally want both turned on.
