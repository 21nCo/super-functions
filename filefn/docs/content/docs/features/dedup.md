---
title: Dedup
description: Optional content-addressable storage with policy- and tenant-scoped checksums.
---

# Dedup

See [Core Concepts › Dedup](../core-concepts/dedup) for the conceptual overview. This page is the operator-facing reference.

## Enabling

```ts
const fileFn = createFileFn({
  db, storage,
  dedup: { enabled: true },
});
```

The kernel checks `(checksumSha256Base64, tenantId, policy)` on `complete` and reuses an existing storage object when there's a match.

## Schema impact

No new tables. Dedup is implemented through the existing `fileVersions` index on `(checksumSha256Base64, tenantId)`. When dedup is on:

- `fileVersions.checksumSha256Base64` is required for every new version.
- The kernel relies on the storage adapter to compute / surface a SHA-256 of the final bytes.

If your adapter doesn't expose a checksum, dedup turns into a no-op for that adapter.

## Adapter requirements

Adapters that support dedup (S3, GCS, R2 with the appropriate flags, local FS via post-write hash):

- `completeMultipartUpload` returns the final `ETag` and SHA-256 (or filefn computes the SHA-256 on its own from the part list).
- `put` similarly.

Adapters that don't are still safe — `complete` succeeds, but `checksumSha256Base64` is `null` and dedup skips.

## What happens when dedup hits

```ts
fileFn.events.on("file:uploaded", (event) => {
  // event.fileId is new
  // event.versionId is new
  // The underlying storageKey may be shared with another fileVersions row.
});
```

There's no separate "dedup.hit" event today. Add one in your code by checking whether `versions.findMany({ storageKey })` returns more than one row.

## Cleanup

When deleting the last `fileVersions` row that references a `storageKey`, also delete the storage object. The kernel's default delete already does this — it counts references before issuing the storage delete.

## Caveats

- Dedup is per-tenant, per-policy. Cross-tenant or cross-policy duplicates create separate storage objects.
- Dedup doesn't compact retroactively. If you turn it on after running for months, existing duplicates stay duplicated.
- Dedup races at scale: 100 simultaneous identical uploads may briefly write 100 storage objects before the dedup index converges. Orphans are cleaned by the abort/expire job.

## See also

- [Recipes › Storage cost optimisation](../recipes/cdn-integration) — pairing dedup with CDN caching.
