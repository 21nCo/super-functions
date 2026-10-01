---
title: Collaboration
description: Exchange authorized Yjs updates and compact exact batches.
---

`@mdfn/collab` handles shared Markdown, sidecar data, awareness, offline queues, reconnects, and contract negotiation. The host owns transport and authentication. The host must authorize the transport or supply `authorizeUpdate`; MDFN does not authorize updates by default. Use `authorizeSidecarUpdate` for protected editorial changes. Before applying a remote update, MDFN checks size, invokes the configured authorization callback, then validates a candidate against document ID, schema hash, profile, protocol, extensions, Markdown, and sidecar rules.

The server's collaboration reads return a bounded batch with `includedUpdateIds` and an optional `nextCursor`. Pass those exact IDs with the snapshot to compaction so updates that arrived afterward remain. Do not replace them with a guessed range. See [collaboration](/docs/reference/collab), [client](/docs/reference/client), and [server](/docs/reference/server).
