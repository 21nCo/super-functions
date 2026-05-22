---
title: Schema
description: Every filefn DB table — columns, types, indexes — and how to migrate them.
---

# Schema

filefn ships seven tables, all prefixed with `namespace` (default `filefn`).

## `filefn_upload_sessions`

| Column | Type | Notes |
| --- | --- | --- |
| `uploadSessionId` | string (PK) | |
| `status` | string | `"open" | "completed" | "aborted" | "expired"` |
| `policy` | string | |
| `fileId` | string? | Set on completion. |
| `fileName` | string | |
| `mimeType` | string | |
| `size` | number | Declared total size. |
| `uploadMode` | string | `"multipart-signed-url" | "multipart-proxy"` |
| `chunkSizeBytes` | number | |
| `totalParts` | number | |
| `storageKey` | string | Computed from policy. |
| `storageUploadId` | string? | Adapter-specific multipart id. |
| `ownerId` | string | Or anonymous principal id. |
| `tenantId` | string? | |
| `idempotencyKey` | string? | Per (owner, tenant). |
| `idempotencyPayloadHash` | string? | |
| `expiresAt` | string | ISO. |
| `createdAt` | string | ISO. |

Indexes:

- PK on `uploadSessionId`.
- Unique partial: `(ownerId, COALESCE(tenantId, ''), idempotencyKey)` where `idempotencyKey IS NOT NULL`.
- `(expiresAt)` for sweepers.

## `filefn_upload_parts`

| Column | Type | Notes |
| --- | --- | --- |
| `uploadSessionId` | string | |
| `partNumber` | number | |
| `etag` | string | |
| `size` | number | |
| `checksumSha256Base64` | string? | |

Index: `UNIQUE (uploadSessionId, partNumber)`.

## `filefn_files`

| Column | Type | Notes |
| --- | --- | --- |
| `fileId` | string (PK) | |
| `currentVersionId` | string | |
| `ownerId` | string | |
| `tenantId` | string? | |
| `visibility` | string | `"public" | "private" | "shared"` |
| `policy` | string | |
| `mimeType` | string | |
| `size` | number | |
| `name` | string | |
| `metadata` | json? | App-defined. |
| `createdAt` | string | |
| `updatedAt` | string | |

Indexes: `(ownerId)`, `(tenantId)`.

## `filefn_file_versions`

| Column | Type | Notes |
| --- | --- | --- |
| `versionId` | string (PK) | |
| `fileId` | string | |
| `storageKey` | string | |
| `mimeType` | string | |
| `size` | number | |
| `checksumSha256Base64` | string? | Required for dedup. |
| `tenantId` | string? | |
| `createdAt` | string | |

Indexes: `(fileId)`, `(checksumSha256Base64, tenantId)` for dedup lookups.

## `filefn_file_artifacts`

| Column | Type | Notes |
| --- | --- | --- |
| `artifactId` | string (PK) | |
| `fileId` | string | |
| `versionId` | string | |
| `kind` | string | e.g. `"thumbnail-thumb"`. |
| `storageKey` | string | |
| `mimeType` | string | |
| `size` | number? | |
| `metadata` | json? | |
| `createdAt` | string | |

Indexes: `(fileId)`, `(versionId)`.

## `filefn_file_permissions`

| Column | Type | Notes |
| --- | --- | --- |
| `permissionId` | string (PK) | |
| `fileId` | string | |
| `userId` | string? | |
| `role` | string? | |
| `tenantId` | string? | |
| `canRead` | boolean | |
| `canWrite` | boolean | |
| `canDelete` | boolean | |
| `canShare` | boolean | |
| `expiresAt` | string? | |
| `createdAt` | string | |

Indexes: `(fileId)`, `(userId)`.

## `filefn_file_shares`

| Column | Type | Notes |
| --- | --- | --- |
| `tokenHash` | string (PK) | SHA-256 of plaintext token. |
| `fileId` | string | |
| `versionId` | string? | If pinned to a version. |
| `expiresAt` | string? | |
| `requiresAuth` | boolean | |
| `maxDownloads` | number? | |
| `downloads` | number | |
| `createdAt` | string | |
| `revokedAt` | string? | |

Index: `(fileId)`.

## Migration

```ts
import { applySchemaToAdapter } from "@superfunctions/db";
const { schemas } = fileFn.getSchema();
await applySchemaToAdapter(db, schemas);
```

Idempotent — safe to run on every boot. Production deployments should generate SQL once and run it through their normal migration pipeline.

## See also

- [Adapters › DB](../adapters/db).
