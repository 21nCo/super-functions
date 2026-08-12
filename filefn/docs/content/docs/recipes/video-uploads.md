---
title: Video uploads
description: Large-file video uploads with multi-resolution transcoding, poster frames, and queued processing.
---

# Video uploads

Goal:

- Multi-GB uploads survive network blips.
- Poster frame at 1s.
- 720p and 480p transcodes for adaptive playback.
- Processing happens off the request path (queued).

## Policy

```ts
fileFn.definePolicy("user-video", {
  contentTypes: ["video/mp4", "video/quicktime", "video/webm"],
  maxSizeBytes: 5 * 1024 * 1024 * 1024,    // 5 GiB
  visibility: "private",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  storagePath: ({ tenantId, fileId, versionId, fileName }) =>
    `tenants/${tenantId}/videos/${fileId}/${versionId}/${fileName}`,
});
```

## Processors (queued)

```ts
import {
  createVideoProcessor,
  createCommandVideoProvider,
} from "@filefn/processing";
import { createFlowFnProvider } from "@flowfn/server";

const flowFn = createFlowFnProvider({
  /* queue + worker config */
});

const video = createVideoProcessor({
  provider: createCommandVideoProvider({ ffmpegPath: "ffmpeg" }),
  poster: { time: 1.0, width: 1024 },
  transcode: [
    { resolution: "720p", codec: "h264", bitrate: "2M" },
    { resolution: "480p", codec: "h264", bitrate: "1M" },
  ],
});

const fileFn = createFileFn({
  db, storage,
  processing: {
    enabled: true,
    processors: [video],
    flowFn, // dispatch processing to a worker
  },
});
```

The worker pulls jobs, runs the processor, and writes artifacts back. The user's upload request returns the moment the bytes finish — they don't wait for a 5-minute transcode.

## Client UX

```ts
const handle = client.uploadFile({
  policy: "user-video",
  file,
});

handle.onProgress(({ bytesUploaded, bytesTotal }) => {
  setProgress((bytesUploaded / bytesTotal) * 100);
});

const result = await handle.done();
// result.fileId, result.versionId — file is uploaded; processing in flight
```

After the upload returns, poll `client.resolveRenderable({ fileId, intent: "preview" })`:

- Initial state: `state: "processing"` — show a "preparing your video" placeholder.
- After transcode: `state: "ready"` — show the poster frame, then the player.

## Adaptive playback

For HLS / DASH, run a custom processor that wraps `ffmpeg` to emit segmented manifests, and store them as separate artifacts (`hls-master`, `hls-720p-segment-N`). Render the master URL in your player.

## Resilience

OPFS offline (`offline.enabled: true`) and `client.resumeUpload` give you "user closed the laptop in the middle of a 4 GiB upload, woke up, finished" semantics out of the box.

## See also

- [Features › Processing](../features/processing).
- [Recipes › OPFS offline](./opfs-offline).
