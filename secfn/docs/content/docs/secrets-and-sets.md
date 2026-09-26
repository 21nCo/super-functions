---
title: Secrets and sets
description: Create, rotate, reveal, and resolve versioned secrets safely.
---

`@secfn/core` encrypts secret versions with AES-256-GCM. Each record gets a random IV and salt; AAD binds its tenant, namespace, secret ID, and version. `@secfn/server` stores encrypted versions, current pointers, secret sets, service tokens, and audit records through the DB adapter. The host owns key provider availability and secure master-key custody.

Secret creation and rotation require transactional storage. Creation inserts the secret and first encrypted version together. Rotation inserts a new version and advances the pointer together; an adapter without transaction support fails before writing. Admin reveal requires explicit confirmation and is audited. Runtime reads require a scoped service token.

Secret sets map members to output names. New sets validate members and output names before persistence. Schema version 4 can bind a set to an immutable environment ID. Runtime resolution prefers an exact environment binding, then a legacy unbound set; members must still pass scope checks. Duplicate output names in corrupt or legacy sets are rejected instead of silently overwriting values. See the [server package reference](/docs/reference/server) and [migration guide](/docs/migrations).
