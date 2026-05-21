---
title: Image uploads
description: Production-grade image upload pipeline with HEIC handling, EXIF stripping, thumbnails, and previews.
---

# Image uploads

Goal: a single component that handles image uploads end to end:

- HEIC inputs converted to JPEG before upload.
- Two thumbnail sizes generated server-side.
- One preview-quality artifact for in-app rendering.
- EXIF metadata stripped to avoid leaking GPS coordinates.

## Server policy

```ts
fileFn.definePolicy("user-image", {
  contentTypes: ["image/png", "image/jpeg", "image/webp"],
  maxSizeBytes: 25 * 1024 * 1024,
  visibility: "private",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  storagePath: ({ tenantId, fileId, versionId, fileName }) =>
    `tenants/${tenantId}/images/${fileId}/${versionId}/${fileName}`,
});
```

`maxSizeBytes` covers iPhone Live Photo size (10-15 MB) plus headroom.

## Server processors

```ts
import {
  createThumbnailProcessor,
  createImageTransformProcessor,
} from "@filefn/processing";

const thumbnails = createThumbnailProcessor({
  sizes: [
    { name: "thumb", width: 256, height: 256 },
    { name: "preview", width: 1024, height: 1024 },
  ],
  format: "jpeg",
  quality: 80,
});

const stripExif = createImageTransformProcessor({
  pipeline: [
    { kind: "auto-orient" },                  // honour EXIF orientation
    { kind: "strip-metadata" },               // delete EXIF / IPTC / XMP
    { kind: "format", format: "jpeg", quality: 85 },
  ],
  outputName: "normalised",
});

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [stripExif, thumbnails],
  },
});
```

## Client wiring

HEIC preprocessing is on by default — you don't need extra code. The browser converts HEIC → JPEG before upload, so the server never sees HEIC.

```ts
const handle = client.uploadFile({
  policy: "user-image",
  file,
});

const { fileId } = await handle.done();
```

## Rendering

```svelte
<script>
  import { onMount } from "svelte";
  import { client } from "$lib/client/filefn";

  let { fileId } = $props();
  let descriptor = $state(null);

  onMount(async () => {
    descriptor = await client.resolveRenderable({
      fileId,
      intent: "preview",
      preferLocal: true,
    });
  });
</script>

{#if descriptor?.state === "ready"}
  <img src={descriptor.source.url} alt="" />
{:else if descriptor?.state === "processing"}
  <Skeleton />
{:else if descriptor?.state === "pending-local"}
  <img src={descriptor.source.url} alt="" /> <!-- OPFS blob -->
{/if}
```

For thumbnail-quality rendering in lists, use `intent: "thumbnail"`. For high-detail rendering on the file's detail page, use `intent: "full"` and let the kernel choose between the original and the largest available artifact.

## EXIF and privacy

`createImageTransformProcessor` with `strip-metadata` is the simplest defence. For stronger guarantees, run a tiny processor that replaces the file's metadata with a controlled subset (e.g. keep colour profile, drop GPS).

## See also

- [Features › Processing](../features/processing).
- [Render intents](../core-concepts/render-intents).
