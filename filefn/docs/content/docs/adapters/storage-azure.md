---
title: Azure Blob adapter
description: createAzureStorage — production-grade storage on Azure Blob with SAS URLs and block blob multipart.
---

# Azure Blob adapter

```ts
import { createAzureStorage } from "@superfunctions/storage";

const storage = createAzureStorage({
  account: process.env.AZURE_STORAGE_ACCOUNT!,
  accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY!,
  container: process.env.AZURE_CONTAINER!,
  // optional
  endpoint: process.env.AZURE_BLOB_ENDPOINT,
});
```

## Capabilities

- Block blob multipart (`stage block` per part, `commit block list` on complete).
- SAS-based `getSignedUrl` and `getSignedDownloadUrl`.
- `put`, `get`, `delete`.

## Auth modes

The bundled adapter expects `accountKey`. For managed-identity deployments, write your own thin adapter that reuses the kernel's contract — the underlying calls are stateless.

## CORS

In the storage account's CORS rules:

- Allowed origins: `https://app.example.com`
- Allowed methods: `PUT, GET, POST`
- Allowed headers: `*`
- Exposed headers: `ETag`
- Max age: `3600`

## CDN

Front the storage account with Azure Front Door or Azure CDN. SAS-signed URLs work transparently behind a CDN as long as the CDN forwards the query string.

## See also

- [Recipes › CDN integration](../recipes/cdn-integration).
