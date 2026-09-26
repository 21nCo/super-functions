---
title: Administration
description: Bind FileFn's scoped Super Console capability to an authorized principal.
---

# Administration

`@filefn/admin` exposes a Super Console capability over FileFn's public domain services. A host application supplies a configured `FileFn` facade and maps each authorized admin actor and scope to a FileFn `principalId` and optional `tenantId`.

```ts
import { createFileFnAdminAdapter, createFileFnDomainAdminService } from "@filefn/admin";

const service = createFileFnDomainAdminService({
  fileFn,
  context: (adminContext) => resolveAuthorizedFileFnContext(adminContext),
});
const adapter = createFileFnAdminAdapter(service);
```

`resolveAuthorizedFileFnContext` is host code. It must derive a principal from the authenticated scope; the domain service rejects a missing `principalId`. Mount the adapter through the shared admin dispatcher with its permission, confirmation, and audit policies. The capability requires at least project scope.

## Resources and actions

The capability covers files, versions, upload sessions, grants, share links, policies, and processing artifacts. Child resources such as versions, grants, shares, and artifacts are listed under an authorized file. Operations include authorized downloads, file deletion, upload creation/completion/abort, grant and share creation/revocation, and artifact processing.

File deletion requires MFA confirmation and removes the file's versions, artifacts, grants, and shares. Other writes carry their own risk and confirmation metadata; the host must enforce the capability's declared policy and write audit records. Upload tokens, storage keys, share tokens, provider URLs and headers, and policy storage paths are sensitive and must not leak through list responses.

For an admin download, standard FileFn download services normally produce a signed URL or application proxy descriptor. It rejects provider request headers instead of exposing them to a browser. Review [downloads](/docs/features/downloads), [grants](/docs/features/grants), and [share links](/docs/features/share-links) for the underlying FileFn access rules.

The [capability source](https://github.com/21nCo/super-functions/blob/dev/filefn/admin/src/index.ts) defines operation IDs and schemas. The [domain service](https://github.com/21nCo/super-functions/blob/dev/filefn/admin/src/domain-service.ts) shows how the public FileFn facade enforces ownership and creates safe responses.

The admin service itself only rejects descriptors with non-empty provider headers; it does not validate a URL’s origin or signature. Hosts using custom storage/download services must ensure that every returned header-free URL is safe for the intended client and authorization scope.
