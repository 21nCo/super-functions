---
title: Processing
description: The filefn processing pipeline — thumbnails, PDF previews, OCR, image transforms, audio waveforms, video posters — with composable processors and stable artifacts.
---

# Processing

filefn ships an opt-in processing pipeline backed by `@filefn/processing`. Processors are functions that run after a successful upload, write artifacts, and emit `processing.*` events.

## Enabling

```ts
import { createFileFn } from "@filefn/server";
import { createThumbnailProcessor, createPdfPreviewProcessor } from "@filefn/processing";

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [
      createThumbnailProcessor({
        sizes: [
          { name: "thumb", width: 256, height: 256 },
          { name: "preview", width: 1024, height: 1024 },
        ],
        format: "jpeg",
        quality: 80,
      }),
      createPdfPreviewProcessor({
        sizes: [{ name: "preview", width: 1024, height: 1024 }],
      }),
    ],
  },
});
```

`enabled: false` (default) means the routes and events still exist, but uploads don't trigger processors.

## Bundled processors

| Function | What it produces | Notes |
| --- | --- | --- |
| `createThumbnailProcessor` | One artifact per size in `sizes` (`thumbnail-<name>`) | Uses the runtime's image library; `sharp` on Node, native primitives on Bun. |
| `createPdfPreviewProcessor` | One raster artifact per size (`pdf-preview-<name>`) | Renders the first page. |
| `createCompressionProcessor` | A `gzip` or `deflate` artifact (`compressed-<algorithm>`) | For text-heavy files. |
| `createOCRProcessor` | `ocr-text` (and optionally `ocr-hocr`, `ocr-json`) | Pluggable provider via `OCRProcessorProvider`. Bundled `createTesseractJsOCRProvider` works in Node. |
| `createImageTransformProcessor` | Per-operation artifacts (resize, crop, rotate) | Composable pipeline within a single processor. |
| `createVideoProcessor` | `video-poster`, `video-transcoded-<resolution>`, `video-metadata` | Pluggable provider via `VideoProcessorProvider`. Bundled `createCommandVideoProvider` shells out to `ffmpeg`. |
| `createAudioProcessor` | `audio-waveform`, `audio-transcoded-<codec>`, `audio-metadata` | Pluggable provider via `AudioProcessorProvider`. Bundled `createCommandAudioProvider` shells out to `ffmpeg`. |

Each processor declares `supportedMimeTypes` — the kernel only invokes processors that match the upload's MIME.

## Anatomy of a processor

```ts
interface Processor {
  name: string;
  supportedMimeTypes: string[];
  process(input: ProcessorInput, getData: () => Promise<Uint8Array>): Promise<ProcessorResult>;
}

interface ProcessorResult {
  success: boolean;
  artifacts: ProcessorOutputArtifact[];
  error?: string;
}
```

`getData()` lazily loads the file bytes. Processors that only need metadata can skip the call.

A custom processor:

```ts
const watermarkProcessor: Processor = {
  name: "watermark",
  supportedMimeTypes: ["image/png", "image/jpeg"],
  async process(input, getData) {
    const data = await getData();
    const watermarked = await applyWatermark(data, input.fileName);
    return {
      success: true,
      artifacts: [
        {
          kind: "watermarked",
          mimeType: input.mimeType,
          data: watermarked,
          storageKey: input.storageKey + ".watermarked",
        },
      ],
    };
  },
};
```

Pass it via `processing.processors`. It runs alongside the bundled processors.

## Inline vs. queued execution

By default, processing runs **inline** in the same request that completes the upload. That's fine for fast processors (thumbnails, PDF previews, OCR-via-API). It's not fine for ffmpeg transcoding.

For queued execution, configure `processing.flowFn`:

```ts
import { createFlowFnProvider } from "@flowfn/server";

const flowFn = createFlowFnProvider({ /* ... */ });

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [/* ... */],
    flowFn,
  },
});
```

When configured, `complete` enqueues a job instead of running processors inline. A worker picks it up, runs the processors, and calls `processingService.recordArtifact(...)` per artifact.

You can swap `@flowfn/server` for any queue that implements:

```ts
interface FlowFnQueue {
  enqueue(job: { fileId: string; versionId: string; storageKey: string; mimeType: string; size: number; fileName: string; tenantId?: string }): Promise<{ jobId: string }>;
}
```

## Routes

| Route | Description |
| --- | --- |
| `GET /:fileId/artifacts` | List all artifacts for the current version. |
| `GET /:fileId/artifacts/:artifactId/download` | Resolve a download URL. |
| `GET /proxy/files/:fileId/artifacts/:artifactId/download` | Proxy-mode download. |
| `POST /:fileId/process` | Manually trigger processors (re-process / lazy mode). |

## Events

```ts
fileFn.events.on("processing.started", (e) => /* upload finished, processors kicked off */);
fileFn.events.on("processing.completed", (e) => /* all processors finished, e.artifactsCreated */);
fileFn.events.on("processing.failed", (e) => /* something errored */);
```

A failure in one processor doesn't block others. Each processor's success/error is recorded in the artifact list (or absent, with the error in `processing.failed`).

## See also

- [Recipes › Custom processor](../recipes/custom-processor) — an end-to-end walkthrough.
- [Recipes › Virus scanning](../recipes/virus-scanning) — pair processing with ClamAV.
- [Render intents](../core-concepts/render-intents) — how artifacts feed render-intent resolution.
