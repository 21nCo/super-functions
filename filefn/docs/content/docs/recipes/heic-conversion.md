---
title: HEIC conversion
description: Handle iPhone HEIC photos correctly in browsers, native iOS, and on the server — without any of them seeing HEIC.
---

# HEIC conversion

Goal: an upload pipeline that accepts HEIC inputs from iPhones and ends up with JPEG bytes everywhere downstream — no HEIC-decoding requirement on the server, no broken `<img>` tags in browsers.

## Browser

HEIC preprocessing is enabled by default, but conversion requires a supplied `converter` or a `globalThis.heic2any` implementation. FileFn does not bundle a decoder or infer universal browser HEIC support. Without a converter, HEIC uploads fail with `FILEFN_HEIC_CONVERSION_FAILED`.

Supply a decoder that produces a JPEG `Blob` (raw decoded pixels are not a JPEG):

```ts
import { createFileFnClient } from "@filefn/client";
import heic2any from "heic2any"; // Install separately; load this in browser-only code.

const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: {
    heic: {
      enabled: true,
      converter: async ({ file, targetMimeType, quality }) => {
        const output = await heic2any({ blob: file, toType: targetMimeType, quality });
        const jpeg = Array.isArray(output) ? output[0] : output;
        if (!jpeg) throw new Error("HEIC conversion produced no image");
        return jpeg;
      },
    },
  },
});
```

## iOS native

`FileFnForegroundUploader` and `FileFnBackgroundUploader` default to `FileFnHEICPreprocessor`:

```swift
let uploader = FileFnForegroundUploader(client: client)

let task = uploader.upload(
    FileFnForegroundUploadRequest(
        source: .photoAsset(asset),
        policy: "user-image"
    )
)

let result = try await task.value()
```

The preprocessor uses `CIImage` to transcode HEIC → JPEG before any bytes leave the app.

## Server side

The built-in `createImageTransformProcessor` accepts PNG, JPEG, WebP, GIF, and TIFF, not HEIC. Keep client preprocessing enabled when using this processor. After conversion, a supported JPEG upload can produce a preview:

```ts
import { createFileFn } from "@filefn/server";
import { createImageTransformProcessor } from "@filefn/processing";

const transform = createImageTransformProcessor({
  operations: [{ operation: "resize", options: { width: 2048, fit: "inside" }, suffix: "preview" }],
  outputFormat: "jpeg",
});
const fileFn = createFileFn({
  database, // Your configured database adapter.
  storage, // Your configured storage adapter.
  processing: { enabled: true, processors: [transform] },
});
```

To retain HEIC originals, supply a custom `Processor` that explicitly accepts `image/heic`/`image/heif`, decodes them using a HEIC-capable provider, and emits JPEG artifacts. Verify codec support in the deployed environment before disabling client preprocessing. Artifacts do not replace the stored original; original/full downloads remain HEIC.
