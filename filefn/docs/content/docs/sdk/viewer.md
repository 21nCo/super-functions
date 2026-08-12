---
title: "@filefn/viewer"
description: Framework-agnostic render-intent resolver utilities for filefn clients.
---

# @filefn/viewer

```bash
npm install @filefn/viewer
```

`@filefn/viewer` ships two helpers that sit on top of any `FileFnClientLike` instance:

- `createViewerResolver(client)` — bare resolver wrapping `client.resolveRenderable`.
- `resolveViewerSource({ client, fileId, intent, versionId?, preferLocal? })` — turns a `RenderDescriptor` into a `ViewerSource` with `revoke?()` for blob cleanup.

## `createViewerResolver`

```ts
import { createViewerResolver } from "@filefn/viewer";
import { createFileFnClient } from "@filefn/client";

const client = createFileFnClient({ baseUrl: "/filefn" });
const resolver = createViewerResolver(client);

const descriptor = await resolver.resolve({
  fileId,
  intent: "preview",
  preferLocal: true,
});
```

`resolver.resolve` is identical to `client.resolveRenderable`. The wrapper exists so non-`@filefn/client` consumers (e.g. a custom HTTP client in your app) can implement `FileFnClientLike` and plug into the same UI helpers.

```ts
interface FileFnClientLike {
  resolveRenderable(input: {
    fileId: string;
    intent: RenderIntent;
    versionId?: string;
    preferLocal?: boolean;
  }): Promise<RenderDescriptor>;
}
```

## `resolveViewerSource`

```ts
import { resolveViewerSource, type ViewerSource } from "@filefn/viewer";

const source: ViewerSource = await resolveViewerSource({
  client,
  fileId,
  intent: "preview",
  preferLocal: true,
});

if (source.placeholderKind) {
  showPlaceholder(source.placeholderKind);
} else if (source.url) {
  showBytes(source.url, source.headers);
}

// Later:
source.revoke?.(); // clean up blob: URLs created by OPFS preview
```

`ViewerSource` flattens the `source.mode` discriminated union into a single shape:

```ts
interface ViewerSource {
  fileId: string;
  versionId: string;
  intent: RenderIntent;
  state: RenderState;
  mimeType: string;
  name: string;
  size: number;
  url?: string;
  headers?: Record<string, string>;
  placeholderKind?: RenderPlaceholderKind;
  warnings?: string[];
  revoke?: () => void;
}
```

`revoke()` calls `URL.revokeObjectURL(url)` for `blob:` URLs (typically pending-local OPFS previews). Always call it when you're done with the URL to avoid leaking memory.

## Why a separate package?

Two reasons:

1. **Framework-agnostic** — the same helpers work in React, Svelte, Vue, vanilla JS. None of them depend on a UI library.
2. **Smaller dependency surface** — packages that only need to render renderables don't pull in OPFS, HEIC preprocessing, or the upload pipeline.

For most apps, `@filefn/client` already includes everything you need. `@filefn/viewer` is for the rare case where you've split rendering from uploading.

## See also

- [Render intents](../core-concepts/render-intents).
- [@filefn/client](./client) — `client.resolveRenderable` directly.
