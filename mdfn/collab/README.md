# `@mdfn/collab`

Yjs-backed collaboration for canonical Markdown, validated editorial/asset
sidecar data, awareness, offline update queues, reconnect flushing, compaction,
and contract negotiation. Transport remains host-controlled: exchange
`encodeUpdate()` bytes over an authorized provider and call `applyUpdate()` for
remote data.

Each remote update is size checked and authorized, then applied to an isolated
candidate document. The candidate must retain the expected document ID, schema
hash, profile, protocol version, extension set, Markdown, and sidecar validity
before the live document is changed. Rejections and queue lifecycle events are
available through the audit callback.

Queue compaction merges only unsent dependency-complete updates. It never
re-encodes the full long-lived `Y.Doc`, whose retained CRDT history can exceed
the transport limit. If a merged row would exceed `maxUpdateBytes`, the session
keeps the original incremental rows and flushes them independently.
