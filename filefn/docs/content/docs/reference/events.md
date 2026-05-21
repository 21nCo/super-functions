---
title: Events
description: Every filefn event with its payload, when it fires, and what's redacted.
---

# Events

filefn emits seven typed events. Subscribe via `fileFn.events.on(name, listener)`.

## Lifecycle

| Event | Fires | Payload (key fields) |
| --- | --- | --- |
| `upload.started` | After `POST /upload/init` succeeds. | `uploadSessionId`, `fileName`, `size`, `mimeType`, `policy`, `principalId`, `tenantId` |
| `part.recorded` | After `POST /upload/:id/parts/:n/complete` succeeds. | `uploadSessionId`, `partNumber`, `size` |
| `file:uploaded` | After `POST /upload/:id/complete` succeeds. | `fileId`, `versionId`, `fileName`, `size`, `mimeType`, `ownerId`, `tenantId` |
| `file:deleted` | After `DELETE /:fileId` succeeds. | `fileId`, `ownerId`, `tenantId` |

## Processing

| Event | Fires | Payload (key fields) |
| --- | --- | --- |
| `processing.started` | After upload completes; processors begin. | `fileId`, `versionId` |
| `processing.completed` | After all processors finish. | `fileId`, `versionId`, `artifactsCreated` |
| `processing.failed` | A processor threw / returned `success: false`. | `fileId`, `versionId`, `error?` |

## Common envelope fields

```ts
interface FileFnEvent {
  type: string;          // "upload.started"
  timestamp: string;     // ISO 8601
  requestId?: string;    // request correlation id
}
```

Plus the per-event payload fields.

## Redaction

The kernel sanitises event payloads before emitting. Tokens, signatures, signed URLs, `Authorization` headers, and live-token strings (`upls_live_*`) are replaced with `[REDACTED]`. You can subscribe to events without worrying about leaking secrets to your logger / queue.

## Wiring

```ts
fileFn.events.on("file:uploaded", (event) => {
  console.log("uploaded", event.fileId, event.versionId);
  // Persist to audit log, kick off downstream pipelines, etc.
});

fileFn.events.on("processing.completed", (event) => {
  if (event.artifactsCreated > 0) {
    invalidateRenderCache(event.fileId);
  }
});

fileFn.events.on("processing.failed", (event) => {
  alertOps({ fileId: event.fileId, error: event.error });
});
```

## Authoring custom events

For domain-specific events (share-clicked, virus-detected, sentiment-scored), emit them from your processors / hooks via your own emitter. The kernel doesn't ship hooks for arbitrary event injection — keep custom events in your own observability layer.

## See also

- [Core Concepts › Events](../core-concepts/events).
- [Core Concepts › Observability](../core-concepts/observability).
