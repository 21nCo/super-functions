---
title: Multi-region plugin
description: Region pinning, lookup, runtime overlays, and wrong-authority redirects.
---

# Multi-region plugin

`authFnMultiRegionPlugin` is the operational backbone of authfn's data-residency story. Read [Concepts → Regions](../core-concepts/regions) first for the mental model — this page is the reference.

```ts
import { authFnMultiRegionPlugin } from '@authfn/core';

authFnMultiRegionPlugin({
  defaultRegionId: 'us-east-1',
  regions: [
    { regionId: 'us-east-1', authority: 'https://api.us.example.com', cookie: { domain: '.us.example.com' } },
    { regionId: 'eu-west-1', authority: 'https://api.eu.example.com', cookie: { domain: '.eu.example.com' } },
  ],
  lookupStore,
});
```

## Configuration

```ts
interface MultiRegionPluginConfig {
  regions?: AuthFnMultiRegionRegionConfig[];
  defaultRegionId?: string;
  lookupStore?: AuthFnRegionLookupStore;
  directory?: AuthFnMultiRegionDirectory;          // deprecated, use lookupStore
}

interface AuthFnMultiRegionRegionConfig {
  regionId: string;
  authority: string;                               // e.g. https://api.us.example.com
  domain?: string;
  hosts?: string[];                                // additional hostnames that map to this region
  issuer?: string;                                 // overrides authority for OIDC issuer
  baseUrl?: string;                                // overrides authority for redirect/url construction
  cookie?: Partial<AuthFnCookieConfig>;
  oauth?: AuthFnRuntimeResolution['oauth'];
}
```

| Option | Notes |
| --- | --- |
| `defaultRegionId` | Fallback region for requests that don't match by host. |
| `regions` | Array of region configs. Order is irrelevant. |
| `lookupStore` | Required for production — see below. |
| `directory` | Deprecated; behave-equivalent to `lookupStore`. |

## Lookup store

```ts
interface AuthFnRegionLookupStore {
  getByIdentifier(identifier: string): Promise<AuthFnRegionLookupRecord | null>;
  putIfAbsent(record: AuthFnRegionLookupRecord): Promise<{
    inserted: boolean;
    existing?: AuthFnRegionLookupRecord;
  }>;
  update(record: AuthFnRegionLookupRecord): Promise<AuthFnRegionLookupRecord>;
  deleteByIdentifier(identifier: string): Promise<void>;
}

interface AuthFnRegionLookupRecord {
  identifier: string;                  // typically lowercase email
  userId?: string;
  regionId: string;
  authority: string;
  domain?: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}
```

The lookup store needs to be **globally consistent** across regions. Common implementations:

- **DynamoDB Global Tables** (AWS): one global table, `identifier` as partition key.
- **Cloudflare D1 + Replicas** or **Hyperdrive + Postgres** with a leader-followers topology.
- **Redis with cross-region streams** (eventual consistency; pair with retries).

`putIfAbsent` is what enforces region pinning under contention. Implement it as a conditional insert (`INSERT ... ON CONFLICT DO NOTHING ... RETURNING`).

If you don't supply a lookup store, the plugin falls back to reading `authfn_users` + `authfn_region_profiles` from the *local* database — fine for setups where every region's database carries every user's region profile (globally-replicated table). Less suitable for setups where each region's DB only holds that region's users.

## Routes

| Method | Path | Operation ID | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/regions/lookup` | `lookupRegion` | Look up the right region for an identifier. Used by the client SDK for pre-routing. |
| `GET` | `/auth/runtime` | `getRuntime` | Returns the runtime resolution for the current request: `{ regionId, authority, baseUrl, … }`. |

## Schema

| Table | Purpose |
| --- | --- |
| `authfn_region_profiles` | `{ id, userId, regionId, authority, domain, createdAt, updatedAt }`. One per user. |

…plus your `lookupStore`'s schema, which the kernel does not enforce.

## Region resolution algorithm

For each request:

1. **Match by host.** If `request.url`'s hostname matches one of `regions[*].hosts` (or `regions[*].authority`'s hostname), pick that region.
2. **Match by `runtime.regionId`** from your `config.runtime.resolve(request)`.
3. **Fallback to `defaultRegionId`.**

The matched region's overlays (`cookie`, `oauth`, `issuer`, `baseUrl`) are applied on top of the base runtime. See [Concepts → Runtime](../core-concepts/runtime) for how this composes with the user-supplied resolver.

## Caching

When a `cacheStore` is configured on the kernel (`config.cacheStore`), region lookups are cached:

- Hits: 5 minutes (`AUTHFN_CACHE_TTL_SECONDS.regionHit`).
- Misses: 1 minute (`AUTHFN_CACHE_TTL_SECONDS.regionMiss`).

Use a Redis-backed `cacheStore` in production to share caches across replicas.

## Conflicts and races

If two regions both attempt to register the same email at the same time:

1. Both call `lookupStore.putIfAbsent(record)`.
2. The first wins (`inserted: true`).
3. The second loses (`inserted: false`, `existing: <winner>`). The plugin throws `AUTHFN_REGION_MISMATCH` with `redirectTo` pointing at the winner's authority and emits `authfn.region.lookup.conflict`.

The losing region also rolls back any local writes it had begun. Implement `lookupStore.putIfAbsent` *before* you do any irreversible write in your custom flows.

## Errors

| Code | When |
| --- | --- |
| `AUTHFN_REGION_MISMATCH` | This authority is not the right one for this user. `details.redirectTo` says where. |
| `AUTHFN_REGION_NOT_FOUND` | The identifier has no region pinning yet. Typically not user-visible — the kernel uses the current region. |
| `AUTHFN_VALIDATION_ERROR` | `lookupRegion` called with a bad identifier. |

## Events

- `authfn.region.lookup` — successful lookup (every privileged route).
- `authfn.region.lookup.conflict` — registration race lost.

## Client integration

`@authfn/client` automatically pre-routes by calling `POST /auth/regions/lookup` before sensitive operations when a `defaultRegionId` is configured. You can disable this if you handle routing entirely at the edge:

```ts
const client = createAuthFnClient({
  baseUrl,
  multiRegion: { preroute: false },
});
```

## Related

- [Concepts → Regions](../core-concepts/regions)
- [Concepts → Runtime](../core-concepts/runtime)
- [Recipes → Multi-region deployment](../recipes/multi-region-deployment)
- [Examples → multi-region-routing](../examples/multi-region-routing)
