---
title: "@filefn/client"
description: The browser / Node / Bun / Deno client SDK — uploadFile, resumeUpload, resolveRenderable, OPFS offline, HEIC preprocessing.
---

# @filefn/client

```bash
npm install @filefn/client
```

## `createFileFnClient`

```ts
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({
  baseUrl: "/filefn",
  getAuthHeaders: async () => ({
    "Authorization": `Bearer ${getToken()}`,
  }),
  retryOptions: { maxRetries: 5, baseDelayMs: 500, maxDelayMs: 30_000 },
  offline: { enabled: true, opfsDir: "filefn-offline" },
  preprocessing: {
    heic: { enabled: true },
  },
});
```

## `FileFnClient` interface

```ts
interface FileFnClient {
  uploadFile(input: UploadInput): UploadHandleWithFileId;
  resumeUpload(uploadSessionId: string, file: Blob, options?: { uploadSessionToken?: string; fileId?: string }): UploadHandle;

  getFile(fileId: string): Promise<Record<string, unknown>>;
  listArtifacts(fileId: string): Promise<ArtifactDescriptor[]>;
  downloadUrl(fileId: string, options?: { versionId?: string }): Promise<string>;
  downloadArtifact(fileId: string, artifactId: string): Promise<string>;
  resolveRenderable(input: { fileId: string; intent: RenderIntent; versionId?: string; preferLocal?: boolean }): Promise<RenderDescriptor>;
  deleteFile(fileId: string): Promise<void>;
  getPendingLocalDescriptor(fileId: string): Promise<PendingLocalDescriptor | null>;
}
```

## `UploadHandle`

```ts
interface UploadHandle {
  uploadSessionId: string;
  uploadSessionToken?: string;
  fileId?: string;
  onProgress(callback: (progress: UploadProgress) => void): void;
  abort(): void;
  done(): Promise<UploadResult>;
}

interface UploadProgress {
  bytesUploaded: number;
  bytesTotal: number;
  partsCompleted: number;
  totalParts: number;
}
```

`uploadFile` returns `UploadHandleWithFileId` (the file id is generated client-side, before the upload starts, so you can use it immediately for optimistic UI).

`resumeUpload` returns a plain `UploadHandle` (no fileId until the resumed session completes).

## Uploading

```ts
const handle = client.uploadFile({
  policy: "public-image",
  file,
  fileName: "avatar.png",
  metadata: { source: "camera-roll" },
  idempotencyKey: "stable-key-from-your-app", // optional
});

handle.onProgress(({ bytesUploaded, bytesTotal, partsCompleted, totalParts }) => {
  setProgress((bytesUploaded / bytesTotal) * 100);
});

try {
  const { fileId, versionId } = await handle.done();
} catch (error) {
  if (error.name === "AbortError") {
    // user cancelled
  }
}
```

## Resuming

```ts
const handle = client.resumeUpload(uploadSessionId, file, {
  uploadSessionToken: storedToken,
  fileId: storedFileId,
});

await handle.done();
```

Useful when:

- the user closed the tab during a large upload (you persisted the session id + token in `localStorage`).
- the offline pipeline isn't enabled but you're rolling your own.

## Render intents

```ts
const renderable = await client.resolveRenderable({
  fileId,
  intent: "preview",
  preferLocal: true,
});
```

`renderable` is a `RenderDescriptor`. Switch on `state`:

- `ready` → render `source.url`.
- `processing` → show a placeholder, refresh later.
- `pending-local` → render the local OPFS URL.
- `unsupported` → show a placeholder; never poll.

See [Render intents](../core-concepts/render-intents).

## OPFS offline

`offline: { enabled: true }` activates the OPFS pipeline. See [Features › Offline](../features/offline) for the details.

## HEIC preprocessing

`preprocessing.heic.enabled: true` (default) transcodes HEIC inputs to JPEG. See [Features › HEIC](../features/heic).

## Retry policy

```ts
const client = createFileFnClient({
  baseUrl: "/filefn",
  retryOptions: {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 30_000,
  },
});
```

The client retries:

- network errors
- 5xx responses
- `FILEFN_RATE_LIMITED` (with backoff to `details.resetAt`)

It does *not* retry:

- 4xx errors that aren't rate-limited (idempotency conflicts, policy violations, auth failures)
- aborted uploads

The retry helpers are exported for direct use:

```ts
import { withRetry, isRetryableError, computeDelay, resolveRetryOptions } from "@filefn/client";
```

## Preprocessors

```ts
import { createHeicPreprocessor, type UploadPreprocessor } from "@filefn/client";

const customPreprocessor: UploadPreprocessor = {
  name: "rotate",
  async process(input, ctx) {
    if (input.mimeType.startsWith("image/")) {
      const rotated = await rotate(input.file, 90);
      return {
        file: rotated,
        mimeType: input.mimeType,
        fileName: input.fileName,
      };
    }
    return null; // don't transform
  },
};

const client = createFileFnClient({
  baseUrl: "/filefn",
  preprocessing: { preprocessors: [customPreprocessor] },
});
```

## Errors

```ts
import { FileFnHttpError } from "@filefn/client";

try {
  // ...
} catch (error) {
  if (error instanceof FileFnHttpError) {
    console.log(error.code, error.status, error.details);
  }
}
```

`FileFnHttpError` exposes:

- `code: string` — the canonical error code.
- `status: number` — the HTTP status.
- `message: string`.
- `details?: Record<string, unknown>`.
- `requestId?: string`.

## See also

- [Quickstart › SvelteKit](../quickstart/sveltekit) — typical client wiring.
- [Recipes › OPFS offline](../recipes/opfs-offline).
