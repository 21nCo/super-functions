---
title: Versions
description: Every successful filefn upload becomes a new fileVersions row — list, target, download, and roll back.
---

# Versions

Every time `POST /upload/:id/complete` succeeds, filefn writes a new `fileVersions` row. The owning `files` row's `currentVersionId` is bumped to the new row. Old versions are kept until you delete the file.

## Routes

| Route | Description |
| --- | --- |
| `GET /:fileId/versions` | List all versions of a file. |
| `GET /:fileId/versions/:versionId` | Get a specific version's metadata. |
| `GET /:fileId/versions/:versionId/download` | Resolve a download URL for that version. |
| `GET /proxy/files/:fileId/versions/:versionId/download` | Proxy-mode download for that version. |

## Schema

```ts
interface FileVersionRecord {
  versionId: string;
  fileId: string;
  storageKey: string;
  mimeType: string;
  size: number;
  checksumSha256Base64?: string;
  tenantId?: string;
  createdAt: string;
}
```

`storageKey` may be shared across versions when [Dedup](./dedup) is on.

## Why versioning?

Versioning is free in filefn. You don't pay for it unless you actually keep old versions around (and dedup further reduces the cost when uploads are byte-identical).

Common patterns:

- **Edit history** — keep every edit of a document; show a timeline.
- **Rollback** — `currentVersionId` is just a pointer; "rollback" is mutating the row.
- **Audit** — every uploaded version is a sealed object addressable by `versionId`.
- **A/B comparison** — render the same image at two `versionId`s side by side.

## Rollback

filefn doesn't ship a `POST /:fileId/rollback` route — the operation depends on your business semantics ("rollback to last good," "rollback to before yesterday's incident"). Implement it in your app:

```ts
const versions = await fetch(`/filefn/${fileId}/versions`).then((r) => r.json());
const targetVersion = pickTargetVersion(versions.data.versions);

await db.update("filefn_files", { currentVersionId: targetVersion.versionId }, { fileId });
```

`@filefn/server` exposes a typed `fileService.updateCurrentVersion(...)` for this — see [SDKs › Server](../sdk/server).

## Pruning old versions

filefn keeps every version forever unless you prune them. A simple cron:

```ts
const cutoff = Date.now() - 90 * 24 * 3600 * 1000;
const old = await db.findMany("filefn_file_versions", {
  where: [{ field: "createdAt", op: "lt", value: new Date(cutoff).toISOString() }],
});

for (const v of old) {
  if (v.versionId === file.currentVersionId) continue;
  await storage.delete(v.storageKey);
  await db.delete("filefn_file_versions", { versionId: v.versionId });
}
```

When dedup is on, check that no other version references the same `storageKey` before deleting bytes.

## Render intents and versions

`GET /:fileId/render?versionId=ver_…` resolves render intents against a specific version. If you upload a new version with new artifacts, the old version still has its old artifacts. If you bump `currentVersionId` back to an older version, that version's artifacts come back.
