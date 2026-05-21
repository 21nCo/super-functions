---
title: Storage targets
description: Logical storage tiers (durable, temporary) and how to route originals and artifacts to different backends.
---

# Storage targets

A storage target is a logical name (`"durable"`, `"temporary"`, `"hot-cdn"`, …) that the storage adapter maps to a concrete bucket / prefix / lifecycle rule. Policies pick the target.

## Why?

In real systems you have at least two tiers:

- **Durable** — long-lived user content, replicated, retained.
- **Temporary** — short-lived staging, transformations, drafts. Often a separate bucket with an aggressive lifecycle policy.

You also frequently want artifacts (thumbnails, PDF previews, OCR text) to land somewhere different from the original — typically a hot-CDN bucket with cache-friendly URLs.

## Per-policy targets

```ts
{
  name: "user-document",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  lifecycle: "durable",
}
```

- `storageTarget` — where the original goes.
- `artifactStorageTarget` — where processing artifacts go (thumbnails, PDF previews, OCR, etc.). Defaults to `storageTarget` when unset.

Read with `resolveStorageTarget(policy)` and `resolveArtifactStorageTarget(policy)` in code.

## How the adapter sees it

The storage adapter's `put(key, payload, { target })` and `getSignedUrl(key, { target })` both receive the resolved `target`. It's up to the adapter to map `"durable"` to a particular bucket, prefix, or storage class. Adapters that don't need targeting can ignore the field — they'll just see one bucket.

## Lifecycle hint

`lifecycle: "durable" | "temporary"` is informational. It doesn't change the kernel's behaviour, but it's surfaced in events and logs so operators can spot temp content stuck in durable storage.

## Default

If you don't set anything, `storageTarget` is `"durable"`. This is the safe choice — files don't disappear unexpectedly.

## Using targets to bridge environments

A common production pattern:

```ts
// production
{ storageTarget: "durable", artifactStorageTarget: "hot-cdn" }

// staging
{ storageTarget: "durable" } // one bucket, no CDN

// dev (local FS)
{ storageTarget: "durable" } // local FS adapter ignores target
```

Same policy code, different bucket layout per environment. Ship the policy in source control, parameterise the adapter at boot.
