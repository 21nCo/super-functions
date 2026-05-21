---
title: MinIO adapter
description: createS3Storage configured for self-hosted MinIO — S3-compatible storage on your own hardware.
---

# MinIO adapter

MinIO is S3-compatible. Use the S3 adapter with `forcePathStyle: true`:

```ts
import { createS3Storage } from "@superfunctions/storage";

const storage = createS3Storage({
  region: "us-east-1",
  bucket: "filefn",
  accessKeyId: "minioadmin",
  secretAccessKey: "minioadmin",
  endpoint: "http://minio:9000",
  forcePathStyle: true, // required for MinIO
});
```

## docker-compose

```yaml
services:
  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    volumes:
      - minio-data:/data
volumes:
  minio-data:
```

Browse `http://localhost:9001` to manage buckets.

## CORS

In the MinIO console: Buckets → Manage → Access Rules → CORS:

```json
[{
  "AllowedOrigins": ["http://localhost:3000", "https://app.example.com"],
  "AllowedMethods": ["PUT", "POST", "GET"],
  "AllowedHeaders": ["*"],
  "ExposeHeaders": ["ETag"]
}]
```

## When to use it

- Self-hosted production where you want object-store semantics without AWS.
- Air-gapped environments.
- CI / staging that needs S3 parity.

## See also

- [storage-s3](./storage-s3) — the underlying adapter.
