---
title: S3 adapter
description: createS3Storage — production-grade storage on AWS S3 with signed-URL multipart, optional CDN fronting, and SSE.
---

# S3 adapter

```ts
import { createS3Storage } from "@superfunctions/storage";

const storage = createS3Storage({
  region: process.env.AWS_REGION!,
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,           // optional
  endpoint: process.env.S3_ENDPOINT,                     // optional, for non-AWS S3
  forcePathStyle: false,                                 // default; set true for MinIO
  serverSideEncryption: "AES256",                        // optional; defaults off
  cdnPrefix: process.env.CDN_PREFIX,                     // optional, e.g. https://cdn.example.com
});
```

## Capabilities

- Multipart with `signPart` (5-MiB minimum, server-enforced).
- `getSignedUrl` and `getSignedDownloadUrl` (15-minute default TTL).
- `put`, `get`, `delete`.
- SSE (server-side encryption) headers.

## CDN fronting

`cdnPrefix` rewrites signed URLs to your CDN. For CloudFront, configure the distribution to:

- forward `Authorization` and any custom headers
- cache by `Vary: Authorization`
- short TTLs for signed URLs (under filefn's `signedUrlTtlSeconds`)

For unsigned public buckets:

```ts
const storage = createS3Storage({
  region: "us-east-1",
  bucket: "public-assets",
  cdnPrefix: "https://cdn.example.com",
  // no accessKeyId / secretAccessKey when bucket policy allows public reads
});
```

## IAM

The minimum policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "s3:PutObject",
      "s3:GetObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:ListMultipartUploadParts"
    ],
    "Resource": "arn:aws:s3:::your-bucket/*"
  }]
}
```

For multi-tenant deployments, scope the resource to a tenant prefix and rotate per-tenant credentials.

## CORS

If clients PUT directly to S3, the bucket needs CORS:

```json
[{
  "AllowedOrigins": ["https://app.example.com"],
  "AllowedMethods": ["PUT", "POST"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3000
}]
```

## See also

- [Recipes › CDN integration](../recipes/cdn-integration).
- [Storage targets](../core-concepts/storage-targets).
