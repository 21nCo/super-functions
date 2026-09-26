---
title: HEIC conversion
description: Handle iPhone HEIC photos correctly in browsers, native iOS, and on the server — without any of them seeing HEIC.
---

# HEIC conversion

Goal: an upload pipeline that accepts HEIC inputs from iPhones and ends up with JPEG bytes everywhere downstream — no HEIC-decoding requirement on the server, no broken `<img>` tags in browsers.

## Browser

`@filefn/client` ships HEIC preprocessing on by default. iOS Safari and Chromium-based browsers can decode HEIC; the bundled preprocessor uses the runtime's image decoder when available, falls back to a polyfill otherwise.

```ts
const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: { heic: { enabled: true } }, // default
});
```

## Custom decoder

When the bundled implementation doesn't fit your needs (e.g. you want a specific WASM decoder for fidelity):

```ts
import heicDecode from "heic-decode";

const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: {
    heic: {
      enabled: true,
      convert: async ({ data, fileName }) => {
        const { data: jpegData } = await heicDecode({ buffer: new Uint8Array(data) });
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

If you'd rather keep HEIC originals and transcode on the server, opt out of preprocessing on every client and add `createImageTransformProcessor`:

```ts
const transform = createImageTransformProcessor({
  operations: [{ operation: "resize", options: { width: 2048, fit: "inside" }, suffix: "preview" }],
  outputFormat: "jpeg",
