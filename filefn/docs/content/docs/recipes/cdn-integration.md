---
title: CDN integration
description: Separate storage authorization from public asset delivery.
---

# CDN integration

The S3 and R2 adapters expose storage operations and signed URLs. They do not accept `cdnPrefix` or rewrite signed storage URLs to a CDN domain. Provision and configure your CDN in the host infrastructure, and choose an authorization model appropriate to public or private assets.

For private files, call FileFn's authorized download-resolution APIs. Preserve the returned URL, request headers, and expiry. Replacing the hostname of a signed URL can invalidate the signature or bypass the intended access policy. Use a host-owned adapter or delivery service if the CDN needs a different signing protocol.

## Route policies to configured storage targets

```ts
import { createRoutedStorageAdapter } from "@superfunctions/storage";
import { createS3StorageAdapter } from "@superfunctions/storage-s3";
import { createLocalStorageAdapter } from "@superfunctions/storage-local";

const storage = createRoutedStorageAdapter({
  defaultTarget: "durable",
  adapters: {
    durable: createS3StorageAdapter({ bucket: process.env.S3_BUCKET!, region: process.env.AWS_REGION! }),
    temporary: createLocalStorageAdapter({ rootDir: "./.filefn-storage" }),
  },
});
```

Policies select a registered target through `storageTarget` and `artifactStorageTarget`. The router uses an explicit adapter map and `defaultTarget`; it has no arbitrary per-request `resolveTarget` callback. Validate environment variables before constructing adapters.

Public CDN delivery is a separate host policy: publish only objects intended to be public, configure cache keys and content headers, and plan invalidation when replacing or removing content. Do not expose private storage keys or long-lived credentials to the browser. See [downloads](/docs/features/downloads) and [storage targets](/docs/core-concepts/storage-targets).
