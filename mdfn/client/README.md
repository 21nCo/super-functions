# `@mdfn/client`

Typed fetch client for documents, versions, sidecar state, and persisted
collaboration updates. `getCollaborationUpdates` returns the update batch with
its `includedUpdateIds`; pass those ids to `compactCollaborationUpdates` with
the snapshot so updates arriving after the read are preserved. Authentication
stays host-controlled through a header callback.
