---
title: Processors
description: The bundled processor catalog from @filefn/processing — thumbnails, PDF previews, OCR, image transforms, video, audio, compression.
---

# Processors

`@filefn/processing` ships eight processors. They cover the most common post-upload work and are designed to be combined.

## Thumbnails

```ts
import { createThumbnailProcessor } from "@filefn/processing";

const thumbnails = createThumbnailProcessor({
  sizes: [
    { name: "thumb", width: 256, height: 256 },
    { name: "preview", width: 1024, height: 1024 },
  ],
  format: "jpeg",
  quality: 80,
  fit: "cover", // "cover" | "contain" | "fill"
});
```

Outputs one artifact per size: `thumbnail-thumb`, `thumbnail-preview`. MIME `image/jpeg` (or `image/png` / `image/webp` per `format`).

Backed by `sharp` on Node, native `Image` APIs on Bun.

## PDF previews

```ts
import { createPdfPreviewProcessor } from "@filefn/processing";

const pdf = createPdfPreviewProcessor({
  sizes: [{ name: "preview", width: 1024, height: 1024 }],
  pages: [1], // optional; default first page only
});
```

Renders specified pages as raster artifacts (`pdf-preview-preview`).

## Compression

```ts
import { createCompressionProcessor } from "@filefn/processing";

const compress = createCompressionProcessor({
  algorithm: "gzip", // "gzip" | "deflate"
  threshold: 1024,   // skip if compressed isn't smaller than threshold
});
```

Outputs `compressed-gzip` (or `-deflate`). Useful for `text/plain`, `application/json`, `text/css`, `application/javascript`.

## OCR

```ts
import {
  createOCRProcessor,
  createTesseractJsOCRProvider,
} from "@filefn/processing";

const ocr = createOCRProcessor({
  provider: createTesseractJsOCRProvider({ languages: ["eng"] }),
  outputs: ["text", "hocr", "json"],
});
```

Outputs:

- `ocr-text` (`text/plain`).
- `ocr-hocr` (`text/html`, optional).
- `ocr-json` (`application/json`, optional).

The bundled `createTesseractJsOCRProvider` uses `tesseract.js` (browser-shaped) under Node. Swap in a cloud OCR (Google Vision, AWS Textract) by implementing `OCRProcessorProvider`:

```ts
interface OCRProcessorProvider {
  recognize(input: { data: Uint8Array; mimeType: string }): Promise<{
    text: string;
    hocr?: string;
    json?: unknown;
  }>;
}
```

## Image transforms

```ts
import { createImageTransformProcessor } from "@filefn/processing";

const transform = createImageTransformProcessor({
  pipeline: [
    { kind: "rotate", angle: -90 },
    { kind: "resize", width: 1024 },
    { kind: "format", format: "webp", quality: 80 },
  ],
  outputName: "normalised",
});
```

Outputs `image-transform-normalised` after applying the pipeline in order. Good for normalising user uploads (e.g. always rotate to EXIF orientation, resize to max dimension, re-encode as WebP).

## Video

```ts
import {
  createVideoProcessor,
  createCommandVideoProvider,
} from "@filefn/processing";

const video = createVideoProcessor({
  provider: createCommandVideoProvider({ ffmpegPath: "ffmpeg" }),
  poster: { time: 1.0, width: 1024 },
  transcode: [
    { resolution: "720p", codec: "h264", bitrate: "2M" },
    { resolution: "480p", codec: "h264", bitrate: "1M" },
  ],
  metadata: true,
});
```

Outputs:

- `video-poster` (a JPEG poster frame).
- `video-transcoded-720p`, `video-transcoded-480p` (MP4 / H.264).
- `video-metadata` (`application/json` with width/height/duration/codecs).

`createCommandVideoProvider` shells out to `ffmpeg`. Make sure it's installed in the runtime image.

## Audio

```ts
import {
  createAudioProcessor,
  createCommandAudioProvider,
} from "@filefn/processing";

const audio = createAudioProcessor({
  provider: createCommandAudioProvider({ ffmpegPath: "ffmpeg" }),
  waveform: { width: 1024, height: 128 },
  transcode: [{ codec: "mp3", bitrate: "128k" }],
  metadata: true,
});
```

Outputs:

- `audio-waveform` (a PNG waveform).
- `audio-transcoded-mp3`.
- `audio-metadata`.

## Composing in `processing.processors`

```ts
const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [
      thumbnails,
      pdf,
      ocr,
      video,
      audio,
    ],
  },
});
```

The kernel runs every processor whose `supportedMimeTypes` matches the upload. A failure in one doesn't block the others.

## Custom processors

Anything that implements:

```ts
interface Processor {
  name: string;
  supportedMimeTypes: string[];
  process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult>;
}
```

is a valid processor. See [Recipes › Custom processor](../recipes/custom-processor) for an end-to-end walkthrough.

## See also

- [Features › Processing](../features/processing) — the kernel side.
- [Render intents](../core-concepts/render-intents) — how artifact `kind`s feed render-intent resolution.
