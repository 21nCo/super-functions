---
title: GCS adapter
description: createGCSStorage — production-grade storage on Google Cloud Storage with signed URLs, multipart upload via XML API, and ADC support.
---

# GCS adapter

```ts
import { createGCSStorage } from "@superfunctions/storage";

const storage = createGCSStorage({
  projectId: process.env.GCP_PROJECT_ID!,
  bucket: process.env.GCS_BUCKET!,
  credentials: {
    clientEmail: process.env.GCP_CLIENT_EMAIL!,
    privateKey: process.env.GCP_PRIVATE_KEY!,
  },
  // OR use ADC (Application Default Credentials) — leave credentials undefined
});
```

## Capabilities

- Multipart via the XML API (parts signed with V4).
- `getSignedUrl` and `getSignedDownloadUrl`.
- `put`, `get`, `delete`.
- `responseHeaders` (Content-Disposition / Content-Type) on signed downloads.

## IAM

Grant the service account on the target bucket:

- `roles/storage.objectAdmin` (full read/write/delete)
- or, more narrowly:
  - `storage.objects.create`
  - `storage.objects.get`
  - `storage.objects.delete`

For signed URL generation, the service account needs `iam.serviceAccountTokenCreator` on itself.

## CORS

```json
[{
  "origin": ["https://app.example.com"],
  "method": ["PUT", "POST", "GET"],
  "responseHeader": ["Content-Type", "x-goog-resumable"],
  "maxAgeSeconds": 3600
}]
```

## CDN fronting

For Cloud CDN in front of a GCS-backed bucket, configure the load balancer with a backend bucket. filefn doesn't ship a `cdnPrefix` on the GCS adapter today; rewrite at the CDN edge or use a custom storage router that proxies signed URLs to your CDN domain.

## See also

- [Recipes › CDN integration](../recipes/cdn-integration).
