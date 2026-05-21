---
title: Tenant isolation
description: Per-tenant storage paths, quotas, grants, and authorization — the production isolation pattern.
---

# Tenant isolation

Goal: a single filefn instance serves many tenants, with clean separation at every layer (storage, DB rows, quotas, grants).

## Principal shape

The principal returned by `auth.resolveSession` should always carry `tenantId`:

```ts
{
  principalId: "user-123",
  tenantId: "tenant-acme",
  role: "org-admin",
}
```

All filefn rows are tagged with `tenantId`. Queries automatically scope by it.

## Storage path layout

```ts
fileFn.definePolicy("user-document", {
  contentTypes: ["application/pdf"],
  maxSizeBytes: 100 * 1024 * 1024,
  visibility: "private",
  storageTarget: "durable",
  artifactStorageTarget: "hot-cdn",
  storagePath: ({ tenantId, fileId, versionId, fileName }) =>
    `tenants/${tenantId}/docs/${fileId}/${versionId}/${fileName}`,
});
```

Every storage object lives under `tenants/<tenantId>/`. If you front it with a CDN, configure cache keys to include the tenant prefix to keep tenant data isolated at the cache layer too.

For per-tenant buckets, route at the storage layer:

```ts
import { createStorageRouter } from "@superfunctions/storage";

const storage = createStorageRouter({
  default: durable,
  resolveTarget: (input) => {
    if (input.policy === "user-document") {
      return tenantBuckets.get(input.tenantId)!;
    }
    return durable;
  },
});
```

## Quotas

```ts
const quota: QuotaProvider = {
  async check({ tenantId, requested }) {
    const plan = await loadTenantPlan(tenantId!);
    const used = await sumStorageUsedFor(tenantId!);
    return {
      allowed: used + requested <= plan.maxBytes,
      current: used,
      limit: plan.maxBytes,
    };
  },
  async used({ tenantId }) {
    const plan = await loadTenantPlan(tenantId!);
    const used = await sumStorageUsedFor(tenantId!);
    return { current: used, limit: plan.maxBytes };
  },
};

const fileFn = createFileFn({ db, storage, quota });
```

## Authorizer

```ts
import { composeAuthorizers, createDefaultAuthorizer } from "@filefn/server";
import type { AuthorizerStrategy } from "@filefn/server";

const orgWideRead: AuthorizerStrategy = {
  async canRead(file, principal) {
    if (principal.tenantId !== file.tenantId) return false; // hard cross-tenant block
    if (principal.role === "org-admin") return true;
    return undefined; // defer
  },
  async canDelete(file, principal) {
    if (principal.tenantId !== file.tenantId) return false;
    if (principal.role === "org-admin") return true;
    return undefined;
  },
};

const authorizer = composeAuthorizers([
  orgWideRead,
  createDefaultAuthorizer({ db, namespace: "filefn" }),
]);

const fileFn = createFileFn({ db, storage, quota, authorizer });
```

The cross-tenant `false` short-circuits — even if the file's `ownerId` matches `principalId` (it shouldn't), the explicit tenant check denies.

## Share links across tenants

By default, share links are public — anyone with the token can download (subject to TTL / cap / `requiresAuth`). To prevent cross-tenant sharing entirely, refuse to mint share links for files outside the principal's tenant — but the kernel already does this through the authorizer's `canShare` check.

## Multi-tenant rate limiting

```ts
import { createRateLimiter } from "@superfunctions/middleware";

const limiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 1000,
  keyResolver: (request, ctx) => ctx.principal?.tenantId ?? `ip:${ctx.ip}`,
  persistence: redisPersistence,
});

const fileFn = createFileFn({ db, storage, rateLimiter: limiter });
```

Now each tenant has its own bucket, and unauthenticated requests fall back to per-IP buckets.

## See also

- [Core Concepts › Visibility](../core-concepts/visibility) — public / private / shared.
- [Features › Quota](../features/quota) — quota provider authoring.
- [Features › Grants](../features/grants) — per-tenant role-based access.
