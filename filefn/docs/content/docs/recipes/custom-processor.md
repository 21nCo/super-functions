---
title: Custom processor
description: Author a processor end-to-end — image watermarking, sentiment scoring, transcoding to a custom format — and ship it as an artifact.
---

# Custom processor

Goal: author and ship a custom processor that runs as part of filefn's pipeline.

## Example: image watermarking

```ts
import type { Processor, ProcessorResult } from "@filefn/processing";
import sharp from "sharp";

export function createWatermarkProcessor(opts: {
  watermarkPng: Uint8Array;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  opacity?: number;
}): Processor {
  return {
    name: "watermark",
    supportedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
    async process(input, getData): Promise<ProcessorResult> {
      const data = await getData();
      const image = sharp(data);

      const meta = await image.metadata();
      const watermark = sharp(opts.watermarkPng).composite();

      const composited = await image
        .composite([
          {
            input: opts.watermarkPng,
            gravity: positionToGravity(opts.position ?? "bottom-right"),
            blend: "over",
          },
        ])
        .toBuffer();

      return {
        success: true,
        artifacts: [
          {
            kind: "watermarked",
            mimeType: input.mimeType,
            data: new Uint8Array(composited),
            storageKey: input.storageKey + ".watermarked",
          },
        ],
      };
    },
  };
}

function positionToGravity(p: string): string {
  switch (p) {
    case "bottom-right": return "southeast";
    case "bottom-left":  return "southwest";
    case "top-right":    return "northeast";
    case "top-left":     return "northwest";
    default: return "southeast";
  }
}
```

## Wire it

```ts
import { readFileSync } from "node:fs";
import { createWatermarkProcessor } from "./watermark-processor";

const watermarkBytes = readFileSync("./assets/watermark.png");

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [
      createWatermarkProcessor({ watermarkPng: watermarkBytes, position: "bottom-right" }),
    ],
  },
});
```

## Render the artifact

```ts
const watermarkedUrl = await fetch(`/filefn/${fileId}/artifacts`, { headers: authHeaders })
  .then((r) => r.json())
  .then((j) => j.data.artifacts.find((a) => a.kind === "watermarked"));

const downloadUrl = await fetch(`/filefn/${fileId}/artifacts/${watermarkedUrl.artifactId}/download`, {
  headers: authHeaders,
})
  .then((r) => r.json())
  .then((j) => j.data.url);
```

## Render-intent integration

If you want `intent: "preview"` to prefer the watermarked artifact:

```ts
const policy = {
  // ...
  renderProfile: "watermarked-preview",
};
```

And register a render profile that maps `"preview"` to the `watermarked` artifact kind. See [Render intents](../core-concepts/render-intents) for the full mapping.

## Caveats

- Processors run sequentially within a single `complete` call (or in a single queue worker). For parallel execution, split into multiple processors with disjoint output `kind`s.
- Processor failures are isolated — one processor's exception doesn't block the others. The `processing.failed` event fires per processor.
- Outputs are content-addressable when [Dedup](../features/dedup) is on. Reuse `storageKey` patterns that allow reuse across files where appropriate.

## See also

- [Adapters › Processors](../adapters/processors) — the bundled catalog.
- [SDKs › Server](../sdk/server) — `Processor` interface.
