---
title: HEIC preprocessing
description: Automatic HEIC → JPEG conversion in @filefn/client and FileFnSwift.
---

# HEIC preprocessing

iOS captures photos as HEIC by default. Most browsers and most servers can't render HEIC. filefn ships an opt-out preprocessor that transcodes HEIC inputs to JPEG before they leave the client.

## Browser

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: {
    heic: { enabled: true }, // default
  },
});
```

Enabled by default. Set to `false` to skip.

How it works:

- The preprocessor inspects the file's MIME type and extension.
- HEIC / HEIF inputs are transcoded to JPEG using the runtime's image-decoder API (where available) or a polyfill.
- The outgoing MIME type becomes `image/jpeg`.
- The outgoing filename is rewritten to `.jpg`.
- Original metadata is preserved through `metadata.originalMimeType` so server-side processors that care about the source can opt back in.

If the browser doesn't support the underlying decoder (older Firefox), the upload fails with `FILEFN_HEIC_CONVERSION_FAILED` — your UI should handle that by either uploading the HEIC unchanged (skip preprocessing) or asking the user to pick a different file.

## Custom HEIC conversion function

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: {
    heic: {
      enabled: true,
      convert: async ({ data, mimeType, fileName }) => {
        // Custom conversion (e.g. WASM-based heic-decode)
        const jpegData = await myWasmHeicDecode(data);
        return {
          data: jpegData,
          mimeType: "image/jpeg",
          fileName: fileName.replace(/\.heic$/i, ".jpg"),
        };
      },
    },
  },
});
```

Useful when you want to run a specific decoder (e.g. libheif via WebAssembly) or skip conversion for certain MIME variants.

## Swift

`FileFnForegroundUploader`, `FileFnBackgroundUploader`, and the WKWebView bridge all default to `FileFnHEICPreprocessor()`:

- HEIC / HEIF → JPEG using `CIImage`.
- Outgoing MIME type → `image/jpeg`.
- Outgoing filename → `.jpg`.

Replace per request:

```swift
let request = FileFnForegroundUploadRequest(
  source: .fileURL(localFileURL),
  policy: "public-image",
  preprocessors: [] // skip HEIC preprocessing entirely
)
```

## Server-side note

Preprocessing happens **before** the upload starts — the server only sees the JPEG. If you want to keep the HEIC original, opt out of preprocessing and let the server-side `Processor` pipeline transcode (with `createImageTransformProcessor` or a custom processor).

## See also

- [Recipes › HEIC conversion](../recipes/heic-conversion).
