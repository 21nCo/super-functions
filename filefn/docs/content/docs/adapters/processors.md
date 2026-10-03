---
title: Processors
description: Configure thumbnail, PDF, compression, OCR, image, video, and audio processing.
---

# Processors

Import processors from `@filefn/processing` and pass the instances in `createFileFn({ db, storage, processing: { enabled: true, processors } })`. Install the runtime dependencies of the processors you enable. Image operations use `sharp`; command media providers need FFmpeg (and FFprobe for metadata).

## Thumbnails and PDF previews

```ts
import { createThumbnailProcessor, createPdfPreviewProcessor } from "@filefn/processing";

const thumbnails = createThumbnailProcessor({
  sizes: [{ name: "thumb", width: 256, height: 256 }],
  format: "jpeg",
  quality: 80,
});
const pdf = createPdfPreviewProcessor({
  sizes: [{ name: "preview", width: 1024, height: 1024 }],
  density: 144,
  format: "png",
});
```

Thumbnail configuration accepts sizes, quality, and format; it has no top-level `fit`. PDF previews render the first page, with a placeholder fallback when rasterization is unavailable; there is no `pages` selector. Outputs include `thumbnail-thumb` and `pdf-preview-page-1-preview` for the names above.

## Compression

```ts
import { createCompressionProcessor } from "@filefn/processing";
const compression = createCompressionProcessor({ algorithm: "gzip", level: 6 });
```

Algorithms are `gzip` and `deflate`. Empty inputs and outputs saving less than roughly 5% are skipped. There is no configurable byte `threshold`. An output artifact has kind `compressed-gzip` or `compressed-deflate`.

## OCR

```ts
import { createOCRProcessor, createTesseractJsOCRProvider } from "@filefn/processing";
const ocr = createOCRProcessor({
  provider: createTesseractJsOCRProvider(),
  language: "eng",
  outputFormat: "all",
});
```

Use `text`, `hocr`, `json`, or `all` for `outputFormat`. The provider factory takes no options; language belongs to the processor. Outputs have kinds `ocr-text`, `ocr-hocr`, and `ocr-json` when requested and available. A custom provider implements the exported `OCRProcessorProvider`, whose `recognize` receives `input`, `imageData`, `language`, and `includeHOCR`, and returns text, confidence, and optional hOCR.

## Image transforms

```ts
import { createImageTransformProcessor } from "@filefn/processing";
const images = createImageTransformProcessor({
  operations: [
    { operation: "rotate", options: { angle: -90 }, suffix: "rotated" },
    { operation: "resize", options: { width: 1024, fit: "inside" }, suffix: "preview" },
  ],
  outputFormat: "webp",
  outputQuality: 80,
});
```

Each operation transforms the original input independently; this is not a sequential pipeline. The example emits `transform-rotated` and `transform-preview`. Operations are `resize`, `crop`, and `rotate`; output format and quality apply to every artifact.

## Video

```ts
import { createVideoProcessor, createCommandVideoProvider } from "@filefn/processing";
const video = createVideoProcessor({
  provider: createCommandVideoProvider({ ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" }),
  generatePoster: true,
  posterOptions: { timestamp: 1, width: 1024 },
  transcode: true,
  transcodeOptions: { resolution: "720p", codec: "h264", bitrate: "2M" },
  extractMetadata: true,
});
```

`transcode` is a boolean, with one `transcodeOptions` object per processor. The example emits `video-poster`, `video-transcoded-720p`, and `video-metadata`. Use separate processor instances if you need multiple renditions and ensure artifact names/storage keys remain distinct.

## Audio

```ts
import { createAudioProcessor, createCommandAudioProvider } from "@filefn/processing";
const audio = createAudioProcessor({
  provider: createCommandAudioProvider({ ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" }),
  transcode: true,
  transcodeOptions: { codec: "mp3", bitrate: "128k" },
  extractMetadata: true,
  generateWaveform: true,
});
```

Outputs include `audio-transcoded-mp3`, `audio-metadata`, and `audio-waveform`. Waveform data is JSON samples/metadata, not a PNG image. `generateWaveform`, `extractMetadata`, and `transcode` are booleans.

## Failures and custom processors

A processor returns `{ success, artifacts, error? }`; inspect processing results rather than treating artifact presence as guaranteed. Unsupported MIME types and unavailable runtime tools can produce failures. A custom implementation follows the exported `Processor` contract:

```ts
import type { Processor } from "@filefn/processing";
const copyText: Processor = {
  name: "copy-text",
  supportedMimeTypes: ["text/plain"],
  async process(input, getData) {
    return {
      success: true,
      artifacts: [{ kind: "text-copy", data: await getData(), mimeType: "text/plain", storageKey: `${input.storageKey}.copy.txt` }],
    };
  },
};
```

See [Processing](../features/processing) for execution and artifact lifecycle.
