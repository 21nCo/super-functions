---
title: Grants
description: Per-user / per-tenant permission grants with the four canonical capabilities — read, write, delete, share — and TTLs.
---

# Grants

Grants are the second access path (alongside `ownerId`). A grant is a row that says "principal X has these capabilities on file Y until time Z."

## Shape

```ts
interface FilePermissionRecord {
  permissionId: string;
  fileId: string;
  userId?: string;       // grant to a user
  role?: string;         // grant to a role (org-admin, etc.)
  tenantId?: string;     // grant scope
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
  expiresAt?: string;    // ISO; null = never expires
  createdAt: string;
}
```

A grant must specify at least one of `userId` or `role`. If both are set, the grant matches when the principal has the role *or* the user id.

## Routes

When grants are wired (default `Authorizer`), the following routes are mounted:

- `POST /:fileId/permissions` — create a grant
- `GET /:fileId/permissions` — list grants on a file
- `DELETE /:fileId/permissions/:permissionId` — revoke

## Enforcement

The kernel calls `authorizer.canRead(file, principal)` (and the obvious siblings) before every read/write/delete/share action. The default authorizer:

1. Returns `true` if `principal.principalId === file.ownerId`.
2. Returns `true` if a non-expired grant matches `(fileId, principalId or role)` with the right capability.
3. Returns `false` otherwise.

## Composition

```ts
import { composeAuthorizers, createDefaultAuthorizer } from "@filefn/server";

const authorizer = composeAuthorizers([
  createDefaultAuthorizer({ db, namespace: "filefn" }),
  myCustomAuthorizer, // first match wins
]);
```

Custom authorizers can implement org-wide read, project-scoped writes, anything else. The first authorizer in the list to return a definitive answer wins; the chain stops there. Otherwise the next is consulted.

## Worked example

```ts
// Bob owns file_xyz.
// We grant alice read + share for 24h.
const grant = await fetch(`/filefn/file_xyz/permissions`, {
  method: "POST",
  body: JSON.stringify({
    userId: "alice",
    canRead: true,
    canWrite: false,
    canDelete: false,
    canShare: true,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  }),
});
```

Now Alice can:

- `GET /filefn/file_xyz/download` → 200
- `POST /filefn/file_xyz/share-links` → 201
- `DELETE /filefn/file_xyz` → 403 (`FORBIDDEN`)

After 24h:

- All routes that require Alice's grant → 403.

## Why grants and not ACLs?

ACLs ("Bob can read") and grants ("Bob has read until tomorrow") are nearly the same data, but the TTL plus the `canShare` capability are what tip the balance:

- ACLs without TTL grow forever and require explicit revocation.
- ACLs typically don't model "can share" separately from "can read" — but those are different rights when share-link tokens exist.
- Grants make the audit trail obvious: "who got what when, until when."

## Grants vs. share links

Grants are first-party access for known principals. Share links are public-or-link-restricted access for unknown / anonymous recipients. Use grants for "Alice can read this." Use share links for "anyone with this link can read this until midnight, max 50 downloads." See [Share links](./share-links).
