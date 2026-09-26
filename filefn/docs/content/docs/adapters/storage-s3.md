---
title: S3 adapter
description: createS3Storage — production-grade storage on AWS S3 with signed URLs and multipart uploads.
---

# S3 adapter

```ts
import { createS3Storage } from "@superfunctions/storage-s3";

const storage = createS3Storage({
  region: process.env.AWS_REGION!,
  bucket: process.env.S3_BUCKET!,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT,                     // optional, for non-AWS S3
  forcePathStyle: false,                                 // default; set true for MinIO
});
```

## Capabilities

- Multipart with `signPart` (5-MiB minimum, server-enforced).
- `getSignedUrl` and `getSignedDownloadUrl` (15-minute default TTL).
- `put`, `get`, `delete`.

## Credentials and delivery

For workload credentials, omit both static credential fields and let the AWS SDK default credential chain resolve them. Temporary credentials (including session tokens) belong in that chain; `sessionToken` is not an adapter option. If supplying static keys, provide both nonempty fields.

Configure encryption and CDN delivery in your storage/infrastructure layer. The adapter has no `serverSideEncryption` or `cdnPrefix` option and does not rewrite signed S3 URLs into CDN URLs. Use FileFn's authorized download resolution for private objects.

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
