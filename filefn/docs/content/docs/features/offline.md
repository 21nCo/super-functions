---
title: Offline
description: OPFS-staged offline uploads, automatic resume on reconnect, and pending-local previews.
---

# Offline

See [Core Concepts › Offline](../core-concepts/offline) for the full conceptual overview. This page is the operator / SDK reference.

## Enabling

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "/filefn",
  getAuthHeaders,
  offline: { enabled: true, opfsDir: "filefn-offline" },
});
```

`offline.enabled` is the only knob. Once on, every `uploadFile(...)` call:

1. Stages the file to OPFS at `<opfsDir>/<uploadSessionId>`.
2. Returns an `UploadHandle` that resolves when sync completes.
3. Automatically replays the upload when `navigator.onLine` becomes `true`.

`offline.opfsDir` defaults to `"filefn-offline"`.

## Browser support

OPFS is available in all current evergreen browsers (Chrome 102+, Edge 102+, Safari 15.2+, Firefox 111+). On unsupported browsers, the client falls back to direct upload — no error.

## Quota

OPFS competes for the browser's storage quota. Estimate before staging large content:

```ts
const { quota = 0, usage = 0 } = await navigator.storage.estimate();
if (quota - usage < file.size) {
  // skip OPFS, upload directly
}
```

The bundled client doesn't do this for you — drop the check in your upload UI.

## Pending-local previews

```ts
const renderable = await client.resolveRenderable({
  fileId,
  intent: "preview",
  preferLocal: true,
});

if (renderable.state === "pending-local") {
  imgElement.src = (renderable.source as { url: string }).url; // blob:...
}
```

`preferLocal: true` checks OPFS first. If the file is staged, you get a `blob:` URL pointing at the local copy.

When the upload completes and processing produces an artifact, the next render call falls back to the artifact URL automatically — your UI just re-renders.

## Cancellation

```ts
const handle = client.uploadFile({ policy: "public-image", file });
handle.abort(); // cancels staging or sync
```

Cancellation:

- Removes the OPFS row.
- Cancels any in-flight network requests.
- Rejects the `done()` promise with an `AbortError`.

## Manual sync control

```ts
import { OfflineSync, OPFSStore } from "@filefn/client";

const store = new OPFSStore({ rootDir: "filefn-offline" });
await store.init();

const sync = new OfflineSync({
  store,
  client: { uploadFile: yourUploadShim },
});

sync.startAutoSync();         // listen for online events
await sync.syncUpload(id);    // sync a specific row
await sync.syncAll();         // sync everything pending
await sync.cancelUpload(id);  // remove without uploading
```

Useful for headless / Electron / advanced UIs.

## What's persisted

`PendingUpload`:

```ts
{
  uploadSessionId: string;
  fileId: string;
  policy: string;
  idempotencyKey: string;
  fileName: string;
  size: number;
  mimeType: string;
  fileData: ArrayBuffer; // OPFS reference
  localSource?: PendingLocalSourceMetadata;
  metadata?: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}
```

No tokens. No absolute paths. The OPFS store is sandboxed to the origin.

## Native parity

The Swift client's `FileFnBackgroundUploader` mirrors OPFS through filesystem-backed snapshots. The shape of the persisted state is intentionally similar so a single mental model spans web and native.
