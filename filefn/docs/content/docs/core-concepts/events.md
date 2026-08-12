---
title: Events
description: The canonical filefn event catalog — upload.started, part.recorded, file:uploaded, processing.*, file:deleted — with redaction rules.
---

# Events

Every meaningful action in filefn emits a structured event through `fileFn.events`. Subscribe to drive observability, downstream side effects (webhook fan-out, search indexing), or audit logs.

## Catalog

| Type | When | Payload |
| --- | --- | --- |
| `upload.started` | After `POST /upload/init` succeeds | `{ uploadSessionId, fileName, size, mimeType, policy, principalId?, tenantId? }` |
| `part.recorded` | After a successful `POST /upload/:id/parts/:n/complete` | `{ uploadSessionId, partNumber, size }` |
| `file:uploaded` | After `POST /upload/:id/complete` writes a `fileVersions` row | `{ fileId, versionId, fileName, size, mimeType, ownerId, tenantId? }` |
| `file:deleted` | After `DELETE /:fileId` | `{ fileId, ownerId, tenantId? }` |
| `processing.started` | When the kernel kicks off processors for a new version | `{ fileId, versionId }` |
| `processing.completed` | After all processors finish | `{ fileId, versionId, artifactsCreated }` |
| `processing.failed` | If processing as a whole errored | `{ fileId, versionId, error? }` |

Every event also carries `type`, `timestamp` (ISO 8601), and an optional `requestId` for correlation.

## Subscribing

```ts
fileFn.events.on("file:uploaded", (event) => {
  console.log(`uploaded ${event.fileName} → ${event.fileId} (${event.size} bytes)`);
});

fileFn.events.on("processing.failed", (event) => {
  metrics.increment("filefn.processing.failed", { fileId: event.fileId });
  if (event.error) errorReporter.capture(event.error);
});
```

`on`, `once`, and `off` come from Node's `EventEmitter` — you can do `events.removeAllListeners("file:uploaded")` if you need to wipe handlers in tests.

## Redaction

Every event payload is sanitised before emission:

- Keys whose lower-case name contains `token`, `secret`, `password`, `signature`, `signedurl`, `signed_url`, or `authorization` are replaced with `[REDACTED]`.
- String values matching common signed-URL or bearer-token patterns are scrubbed (`X-Amz-Signature=…`, `Bearer eyJ…`, `upls_live_…`).
- Recursion through arrays and nested objects is automatic.

This means you can pipe events to logs, observability sinks, and webhook bodies without leaking signed URLs or session tokens.

## Webhook fan-out

The kernel emits in-process. To fan out to webhooks:

```ts
fileFn.events.on("file:uploaded", async (event) => {
  await fetch(process.env.WEBHOOK_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...event, source: "filefn" }),
  });
});
```

Use a real queue if reliability matters — drop the event into Cloud Tasks / SQS / similar and have a worker do the HTTP call.

## Ordering and at-most-once

`EventEmitter` is synchronous and in-process. If your handler throws, other handlers still run, but the event is **not** retried. If you need at-least-once delivery, wrap the handler in a queue.

## What's *not* an event

- Reads (`GET /:fileId`, `GET /`, `GET /:fileId/render`) don't emit. They're hot paths.
- Share-link creation / revocation doesn't emit yet (issue tracker has a request for this).
- Grant creation / revocation doesn't emit yet.

If you need any of these, drop a comment on the issue tracker — the redaction rules already exist; adding more event types is mostly schema work.
