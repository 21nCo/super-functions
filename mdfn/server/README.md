# `@mdfn/server`

Self-hosted document CRUD, canonical source validation, optimistic versioning,
immutable revisions, editorial workflows, persisted collaboration updates,
authorization hooks, and a Web Standard router. The incoming
`@superfunctions/db` adapter is always wrapped internally with the MDFN schema.

Durable mode is the default and rejects database adapters without transaction
support. Create/update/restore/editorial writes validate both Markdown and the
complete sidecar, run atomically, and support idempotency through the
`Idempotency-Key` header or request body. Delete atomically removes the
document, revisions, receipts, and collaboration updates. Ephemeral mode must
be selected explicitly and is intended only for memory-backed tests.

The router exposes document and version CRUD, version restore, sidecar and
audit reads, comment/reply/resolve, suggestion/decision, review transitions,
and collaboration update append/read/compact routes under `/api/mdfn` by
default. Collaboration reads return both the updates and their exact
`includedUpdateIds`; compaction requires those ids and removes only that
represented batch, preserving updates that arrive concurrently. Every
operation is tenant/owner scoped and passes through the host's authorization
callback.
