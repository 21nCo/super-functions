---
title: Quota
description: Pluggable storage quotas — per-user, per-tenant, or any custom dimension.
---

# Quota

filefn doesn't ship a default `QuotaProvider` — what counts as "your quota" depends on your billing model. The hook is small:

```ts
interface QuotaProvider {
  check(input: { principalId?: string; tenantId?: string; requested: number }): Promise<{ allowed: boolean; current: number; limit: number }>;
  used(input: { principalId?: string; tenantId?: string }): Promise<{ current: number; limit: number }>;
}
```

## Wiring

```ts
const fileFn = createFileFn({
  db, storage,
  quota: myQuotaProvider,
});
```

The kernel calls `check` during `POST /upload/init` with `requested = size`. If `allowed === false`, the request fails with `FILEFN_QUOTA_EXCEEDED` (HTTP 402).

## Routes

`GET /quota/storage` returns:

```json
{
  "ok": true,
  "data": { "current": 1234567, "limit": 10000000 }
}
```

The kernel calls `quota.used(...)` for the current principal/tenant. The route returns 404 when no quota provider is configured.

## A simple in-memory provider

```ts
const used = new Map<string, number>();

const quota: QuotaProvider = {
  async check({ tenantId, requested }) {
    const current = used.get(tenantId ?? "default") ?? 0;
    const limit = 50 * 1024 * 1024 * 1024; // 50 GiB per tenant
    return { allowed: current + requested <= limit, current, limit };
  },
  async used({ tenantId }) {
    const current = used.get(tenantId ?? "default") ?? 0;
    return { current, limit: 50 * 1024 * 1024 * 1024 };
  },
};
```

In production you'd back `used` with the DB (`SUM(size)` from `fileVersions`).

## Failure semantics

`FILEFN_QUOTA_EXCEEDED` returns:

```json
{
  "ok": false,
  "error": {
    "code": "FILEFN_QUOTA_EXCEEDED",
    "message": "Storage quota exceeded",
    "details": { "current": 9_950_000_000, "limit": 10_000_000_000, "requested": 100_000_000 }
  }
}
```

Your client UI can show "you're at 99.5 GiB of 100 GiB; this upload would exceed your plan."

## Quota and dedup

When dedup is on, an upload that hits an existing storage object still counts against quota — the user has a logical file regardless of physical bytes. That's usually what you want; a dedup-aware quota would let one user fill up storage by uploading copies of someone else's file.

## See also

- [Core Concepts › Security](../core-concepts/security) — quota as a DoS mitigation.
- [Recipes › Tenant isolation](../recipes/tenant-isolation).
