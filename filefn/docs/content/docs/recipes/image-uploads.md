---
title: Image uploads
description: Production-grade image upload pipeline with HEIC handling, EXIF stripping, thumbnails, and previews.
---

# Image uploads

Goal: a single component that handles image uploads end to end:

- HEIC inputs converted to JPEG before upload.
- Two thumbnail sizes generated server-side.
- One preview-quality artifact for in-app rendering.
- JPEG-derived artifacts omit EXIF metadata; original bytes remain unchanged.

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

// Sharp’s JPEG re-encode drops EXIF by default; this does not modify the original.
const normalise = createImageTransformProcessor({
  operations: [{ operation: "resize", options: { width: 2048, fit: "inside", withoutEnlargement: true }, suffix: "normalised" }],
  outputFormat: "jpeg",
  outputQuality: 85,
});

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [normalise, thumbnails],
  },
});
```

## Client wiring

HEIC preprocessing is enabled by default, but you must supply a converter or `globalThis.heic2any`. Follow the [HEIC recipe](./heic-conversion) and handle conversion failures before uploading; the server processor only accepts supported image formats.

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

For thumbnail-quality rendering in lists, use `intent: "thumbnail"`. `intent: "full"` and download requests return original bytes. They do not inherit the derived artifacts’ metadata privacy properties.

## EXIF and privacy

`createImageTransformProcessor` supports only `resize`, `crop`, and `rotate`; there is no `strip-metadata` operation. Its Sharp JPEG re-encode drops EXIF by default. Consume the `transform-normalised` or thumbnail artifacts when this property is required, and verify their metadata in your processing environment. Original/full/download access still exposes the original bytes and any embedded metadata. Remove sensitive metadata before upload if the original itself must be safe to disclose.

## See also

- [Features › Processing](../features/processing).
- [Render intents](../core-concepts/render-intents).
