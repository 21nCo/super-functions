---
title: OPFS offline
description: Reliable uploads when the network is bad — OPFS-staged content with automatic resume on reconnect.
---

# OPFS offline

Goal: a flaky-network-friendly upload that persists across tab reloads and resumes when the user reconnects.

## Enable

```ts
const client = createFileFnClient({
  baseUrl: "/filefn",
  offline: { enabled: true, opfsDir: "filefn-offline" },
});
```

That's it. Every `uploadFile(...)` call:

1. Stages bytes to OPFS at `<opfsDir>/<uploadSessionId>`.
2. Returns an `UploadHandle` whose `done()` waits for sync.
3. Auto-syncs when `navigator.onLine` becomes `true`.

## Showing pending-local previews

```ts
const renderable = await client.resolveRenderable({
  fileId,
  intent: "preview",
  preferLocal: true,
});

if (renderable.state === "pending-local") {
  imgElement.src = (renderable.source as { url: string }).url; // blob: URL
}
```

## Listing pending uploads

```ts
import { OPFSStore } from "@filefn/client";

const store = new OPFSStore({ rootDir: "filefn-offline" });
await store.init();
const pending = await store.list();

for (const upload of pending) {
  console.log(upload.fileName, upload.size, upload.retryCount);
}
```

Useful for an "uploads in progress" UI that survives reloads.

## Cancelling

```ts
const handle = client.uploadFile({ policy: "user-image", file });
handle.abort(); // removes OPFS row, cancels in-flight requests
```

## Quota

Before staging, check `navigator.storage.estimate()`:

```ts
const { quota = 0, usage = 0 } = await navigator.storage.estimate();
if (quota - usage < file.size) {
  // Skip OPFS — upload directly without offline persistence.
  // Or surface the issue and prompt the user to clear OPFS.
}
```

## Headless mode

If you want full control over staging / sync (e.g. an Electron app):

```ts
import { OfflineSync, OPFSStore } from "@filefn/client";

const store = new OPFSStore({ rootDir: "filefn-offline" });
await store.init();

const sync = new OfflineSync({ store, client: { uploadFile } });

sync.startAutoSync();           // listen for online events
await sync.syncUpload(id);      // sync a specific row
await sync.syncAll();           // sync everything pending
```

## See also

- [Features › Offline](../features/offline) — full reference.
- [Core Concepts › Offline](../core-concepts/offline) — design rationale.
