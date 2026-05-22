---
title: Policies
description: Named upload policies that gate content type, size, visibility, storage target, and storage path layout.
---

# Policies

A policy is a named contract for an upload: what's allowed, where it lands, and how to render it. Every upload references a policy by name. Skipping policies is not supported.

## Shape

```ts
interface Policy {
  name: string;
  contentTypes?: string[];           // allow-list, supports "image/*"
  maxSizeBytes?: number;             // upper bound on file size
  visibility?: "public" | "private" | "shared";
  storageTarget?: string;            // logical target (e.g. "durable" | "temporary")
  artifactStorageTarget?: string;    // separate target for processing artifacts
  lifecycle?: "durable" | "temporary";
  renderProfile?: "default" | "nucleus";
  storagePath?: (ctx) => string;     // override the default key layout
}
```

## Registration

You can register policies at boot time:

```ts
const fileFn = createFileFn({
  db, storage,
  policies: [
    {
      name: "public-image",
      contentTypes: ["image/png", "image/jpeg", "image/gif", "image/webp"],
      maxSizeBytes: 10 * 1024 * 1024,
      visibility: "public",
    },
    {
      name: "private-document",
      contentTypes: ["application/pdf", "text/plain"],
      maxSizeBytes: 100 * 1024 * 1024,
      visibility: "private",
    },
  ],
});
```

Or at runtime:

```ts
fileFn.definePolicy("user-avatar", {
  contentTypes: ["image/png", "image/jpeg"],
  maxSizeBytes: 1024 * 1024,
  visibility: "public",
  renderProfile: "nucleus",
});
```

`definePolicy` overwrites by name.

## Validation

When a client calls `POST /upload/init` with `policy: "public-image"`:

- If the policy is not registered → `FILEFN_POLICY_NOT_FOUND`.
- If `mimeType` is not on the `contentTypes` allow-list → `FILEFN_POLICY_CONTENT_TYPE_NOT_ALLOWED`.
- If `size > maxSizeBytes` → `FILEFN_POLICY_MAX_SIZE_EXCEEDED`.
- If a `quota` is configured and would be exceeded → `FILEFN_QUOTA_EXCEEDED`.

`contentTypes` accepts wildcards: `"image/*"`, `"video/*"`. The matcher is the same `matchesContentType` you can call yourself from `@filefn/server`.

## Storage path layout

```ts
storagePath?: (ctx: {
  fileName: string;
  principalId?: string;
  tenantId?: string;
  fileId: string;
  versionId: string;
}) => string;
```

The default layout is:

```
<tenantId>/<principalId>/<fileId>/<versionId>-<fileName>
```

You can override per policy. Common overrides:

```ts
// Bucket per tenant
storagePath: ({ tenantId, fileId, versionId, fileName }) =>
  `tenant-${tenantId}/${fileId}/${versionId}/${fileName}`

// Date-partitioned cold storage
storagePath: ({ fileId, versionId }) => {
  const now = new Date();
  return `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${fileId}/${versionId}`;
}
```

Any `..` and slashes in the input are sanitised before reaching `storagePath`.

## Visibility

See [Visibility](./visibility) for the full breakdown. Short version:

- **`public`** — file is publicly readable. Download URLs may include a long-lived signed URL or a CDN path.
- **`private`** — file is owner-only by default. Sharing requires grants or share links.
- **`shared`** — file is private but explicitly shareable through grants. Same enforcement as `private`; the visibility is informational for UIs.

## Render profile

- **`default`** — the renderable resolver returns originals when no artifact exists.
- **`nucleus`** — the resolver enforces the bundled "nucleus" content types (image/audio/video/pdf/markdown/plain) and falls back to placeholders for everything else. This is the right default for embedded preview UIs.

`createNucleusPolicies()` ships two ready-to-use presets:

- `nucleus-durable-default`
- `nucleus-temporary-default`

Use them directly or as a base.

## Why policies?

Without policies, every upload would need to embed its own size limit, content-type check, visibility flag, and storage layout — and you'd lose the ability to evolve them centrally. Policies are the single place where the operator decides "what's allowed in this slot, and where does it go."
