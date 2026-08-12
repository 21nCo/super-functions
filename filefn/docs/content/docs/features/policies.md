---
title: Policies
description: Named upload contracts that gate content type, size, visibility, storage target, and storage path layout.
---

# Policies

See [Core Concepts › Policies](../core-concepts/policies) for the conceptual model. This page is the operator-facing reference.

## Routes

| Route | Description |
| --- | --- |
| `GET /policies` | List registered policies (name, allowed content types, max size, visibility). |

The route returns enough to drive a client-side picker without exposing the storage path layout function.

## Bundled presets

`createNucleusPolicies()` returns two ready-to-use presets:

- `nucleus-durable-default` — durable storage, `nucleus` render profile.
- `nucleus-temporary-default` — temporary storage, `nucleus` render profile.

Both:

- allow `image/*`, `audio/*`, `video/*`, `application/pdf`, `text/markdown`, `text/plain`
- cap at 100 MiB (`NUCLEUS_MAX_SIZE_BYTES`)
- visibility `private`

```ts
import { createFileFn, createNucleusPolicies } from "@filefn/server";

createFileFn({
  db, storage,
  policies: createNucleusPolicies(),
});
```

## Programmatic registration

```ts
fileFn.definePolicy("user-document", {
  contentTypes: ["application/pdf", "text/plain"],
  maxSizeBytes: 50 * 1024 * 1024,
  visibility: "private",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  storagePath: ({ tenantId, fileId, versionId, fileName }) =>
    `tenant-${tenantId}/docs/${fileId}/${versionId}/${fileName}`,
  renderProfile: "default",
});
```

`definePolicy` overwrites by name. Idempotent.

## Validation

The kernel validates every upload against:

1. Policy exists (`FILEFN_POLICY_NOT_FOUND` if not).
2. `mimeType` matches `contentTypes` (`FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED`).
3. `size <= maxSizeBytes` (`FILEFN_POLICY_MAX_SIZE_EXCEEDED`).

Quota and rate limiting run after policy checks.

## Storage path utilities

`@filefn/server` exports:

```ts
import {
  computeStoragePath,
  resolveStorageTarget,
  resolveArtifactStorageTarget,
  matchesContentType,
} from "@filefn/server";
```

Use these when implementing custom processors or background jobs that need to derive paths the same way the kernel does.

## See also

- [Storage targets](../core-concepts/storage-targets).
- [Visibility](../core-concepts/visibility).
- [Recipes › Tenant isolation](../recipes/tenant-isolation) — per-tenant policy + storage path.
