---
title: Grants
description: Per-user / per-tenant permission grants — read, write, delete, share — with TTLs.
---

# Grants

See [Core Concepts › Grants](../core-concepts/grants) for the conceptual overview. This page is the operator-facing reference.

## Enabling

Grants are wired through the `Authorizer`. The default authorizer (`createDefaultAuthorizer`) reads from `filePermissions` automatically when grants exist on a file. To explicitly opt in, configure:

```ts
import { createDefaultAuthorizer } from "@filefn/server";

const authorizer = createDefaultAuthorizer({ db, namespace: "filefn" });

const fileFn = createFileFn({
  db, storage,
  authorizer,
});
```

## Routes

- `POST /:fileId/permissions` — create
- `GET /:fileId/permissions` — list
- `DELETE /:fileId/permissions/:permissionId` — revoke

## Capability bits

```ts
{
  canRead:   boolean,
  canWrite:  boolean,
  canDelete: boolean,
  canShare:  boolean,
}
```

These map directly to:

- `canRead` — `GET /:fileId`, `GET /:fileId/download`, `GET /:fileId/render`, version routes.
- `canWrite` — overwrite via a new upload session for the same `fileId` + the file's policy.
- `canDelete` — `DELETE /:fileId`.
- `canShare` — `POST /:fileId/share-links`.

The owner has all four implicitly. Grants supplement the owner's capabilities for non-owners.

## TTL

`expiresAt` is enforced on every authorisation check. Expired grants are kept in the table for audit; you can prune them with a cron.

## Roles vs. users

A grant can target either a `userId` or a `role`. Both can be set; the grant matches if either matches.

The kernel doesn't ship a role registry — you decide what `"org-admin"` or `"team-editor"` means. The principal returned by `auth.resolveSession` should expose a `role` (or array of roles) field; the authorizer matches against it.

## Listing

`GET /:fileId/permissions` returns full permission rows (including the IDs you need to revoke). It enforces ownership / `canShare` capability — anonymous callers get 403.

## Composing custom authorizers

```ts
import { composeAuthorizers, createDefaultAuthorizer, type AuthorizerStrategy } from "@filefn/server";

const orgWideRead: AuthorizerStrategy = {
  async canRead(file, principal) {
    if (principal.role === "org-admin" && file.tenantId === principal.tenantId) {
      return true; // org admins can read everything in their org
    }
    return undefined; // defer to the next strategy
  },
};

const authorizer = composeAuthorizers([
  orgWideRead,
  createDefaultAuthorizer({ db, namespace: "filefn" }),
]);
```

`undefined` means "I don't know — ask the next strategy." `true` / `false` short-circuit. Always end the chain with `createDefaultAuthorizer` (or your own catch-all) so every check has a final answer.

## See also

- [Recipes › Tenant isolation](../recipes/tenant-isolation).
