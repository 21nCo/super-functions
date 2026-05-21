---
title: Cloudflare R2 adapter
description: createS3Storage configured for Cloudflare R2 — egress-free production storage with full S3 multipart compatibility.
---

# Cloudflare R2 adapter

R2 is S3-compatible. Use the S3 adapter with R2's endpoint:

```ts
import { createS3Storage } from "@superfunctions/storage";

const storage = createS3Storage({
  region: "auto",
  bucket: process.env.R2_BUCKET!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  cdnPrefix: process.env.R2_PUBLIC_URL, // your r2.dev or custom domain
});
```

## Why R2 specifically

- Zero egress fees — moving large files out doesn't cost bandwidth.
- S3 multipart parity — every signed-URL flow works unchanged.
- First-class Workers binding — when running filefn on Workers, you can also bind R2 directly via the Workers runtime; the bundled S3 adapter still works for portability across runtimes.

## CDN

R2 ships with `r2.dev` URLs (rate-limited, intended for dev) and a custom-domain feature (production). Wire the public domain through `cdnPrefix`.

For private buckets, signed URLs work just like S3.

## CORS

Configure CORS on the R2 bucket from the dashboard or via the API:

```json
[{
  "AllowedOrigins": ["https://app.example.com"],
  "AllowedMethods": ["GET", "PUT", "POST"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```

## See also

- [storage-s3](./storage-s3) — the underlying adapter.
