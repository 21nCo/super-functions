---
title: Storage adapters
description: The StorageAdapter contract — what every backend must implement, and how the kernel uses it.
---

# Storage adapters

`@superfunctions/storage` defines `StorageAdapter`. Every backend (S3, GCS, Azure, R2, MinIO, local FS) implements it.

## Contract

```ts
interface StorageAdapter {
  // Multipart
  initiateMultipartUpload(input: { storageKey: string; mimeType: string; metadata?: Record<string, string> }): Promise<{ uploadId: string }>;
  signPart(input: { storageKey: string; uploadId: string; partNumber: number; contentLength: number; ttlSeconds: number }): Promise<{ url: string; headers?: Record<string, string>; expiresAt: string }>;
  completeMultipartUpload(input: { storageKey: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }): Promise<{ etag?: string; checksumSha256Base64?: string }>;
  abortMultipartUpload(input: { storageKey: string; uploadId: string }): Promise<void>;

  // Proxy mode (filefn streams bytes through itself)
  uploadPart(input: { storageKey: string; uploadId: string; partNumber: number; data: Uint8Array | ReadableStream }): Promise<{ etag: string }>;

  // Single-shot
  put(input: { storageKey: string; mimeType: string; data: Uint8Array; metadata?: Record<string, string> }): Promise<{ etag?: string; checksumSha256Base64?: string }>;
  get(input: { storageKey: string }): Promise<{ data: Uint8Array; mimeType: string }>;
  delete(input: { storageKey: string }): Promise<void>;

  // Read URLs
  getSignedUrl?(input: { storageKey: string; ttlSeconds: number; responseHeaders?: Record<string, string> }): Promise<{ url: string; headers?: Record<string, string>; expiresAt: string }>;
  getSignedDownloadUrl?(input: { storageKey: string; ttlSeconds: number; fileName?: string; mimeType?: string }): Promise<{ url: string; headers?: Record<string, string>; expiresAt: string }>;
}
```

The optional `getSignedUrl` / `getSignedDownloadUrl` enable signed-URL downloads. Adapters that don't implement them force filefn to proxy reads.

## Multi-adapter wiring

filefn supports multiple backends keyed by `storageTarget`:

```ts
import { createStorageRouter } from "@superfunctions/storage";

const storage = createStorageRouter({
  default: localStorage,
  targets: {
    durable: gcsStorage,
    "hot-cdn": cloudfrontFrontedS3Storage,
    temporary: localStorage,
  },
});
```

Policies pin themselves to a target via `policy.storageTarget` and `policy.artifactStorageTarget`. See [Storage targets](../core-concepts/storage-targets).

## Caveats

- Proxy mode (`uploadPart`) is mandatory. Even if every storage adapter you use supports signed URLs, filefn falls back to proxy mode when `getSignedUrl` returns "not supported."
- `getSignedUrl` should respect `responseHeaders` for `Content-Disposition` overrides where possible (S3, GCS via signed URL parameters).
- Adapters that share buckets across tenants must enforce path prefix isolation in their bucket policy — filefn computes paths from policies, not from caller-controlled input, but defence in depth helps.

## See also

- [@superfunctions/storage on npm](https://www.npmjs.com/package/@superfunctions/storage)
- [storage-local](./storage-local), [storage-s3](./storage-s3), [storage-gcs](./storage-gcs), [storage-azure](./storage-azure), [storage-r2](./storage-r2), [storage-minio](./storage-minio).
