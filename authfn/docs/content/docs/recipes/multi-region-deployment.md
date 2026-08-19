---
title: Multi-region deployment
description: Two regions, a globally-replicated lookup store, and a client that routes by email.
---

# Multi-region deployment

## Goal

Run authfn in multiple regions with data residency: EU users' data in EU, US users' data in US.

## Plugins

- `authFnMultiRegionPlugin`.

## Topology

```
                ┌──────────────────────┐
                │   Lookup store       │
                │  (globally replicated)│
                └─────────┬────────────┘
                          │
       ┌──────────────────┴──────────────────┐
       │                                     │
   us-east-1                              eu-west-1
   - Postgres (us)                        - Postgres (eu)
   - api.us.example.com                   - api.eu.example.com
   - cookie domain .us.example.com        - cookie domain .eu.example.com
```

## Lookup store

Use a globally consistent `ConditionalKVStoreAdapter`. AuthFn stores a JSON
lookup record under `authfn:region:<normalized-identifier>` and relies on the
conditional write to settle cross-region registration races. The contract:

```ts
{
  get(key) { ... },
  set({ key, value, ttlSeconds }) { ... },
  setIfAbsent({ key, value, ttlSeconds }) { ... }, // atomic conditional insert
  delete(key) { ... },
}
```

For managed adapters, use `createDynamoDbRegionLookupStore` from
`@authfn/lookup-dynamodb` or `createCloudflareRegionLookupStore` from
`@authfn/lookup-cloudflare-do`.

## Server config (per region)

```ts
plugins: authFnPlugins(authFnMultiRegionPlugin()),
environment: authFnMultiRegionEnvironment({
  defaultRegionId: process.env.REGION_ID,           // 'us-east-1' or 'eu-west-1'
  regions: [
    { regionId: 'us-east-1', authority: 'https://api.us.example.com', cookie: { domain: '.us.example.com' } },
    { regionId: 'eu-west-1', authority: 'https://api.eu.example.com', cookie: { domain: '.eu.example.com' } },
  ],
  lookupStore: createGlobalLookupStore(),
}),
```

## Client config

```ts
const client = createAuthFnRegionalClient({
  defaultRegionId: 'us-east-1',
  resolveBaseUrl(regionId) {
    return regionId === 'eu-west-1' ? 'https://api.eu.example.com/auth' : 'https://api.us.example.com/auth';
  },
});

const prep = await client.prepareEmailAuth({ email, flow: 'sign-in' });
// prep.data.regionId → use that region for the actual sign-in
```

## What happens on the wrong authority

- The kernel detects the mismatch.
- Returns `409 AUTHFN_REGION_MISMATCH` with `details.redirectTo`.
- The regional client follows the redirect and retries on the right authority.

## Cookie domain

Each region's cookie is bound to its region's domain (`.us.example.com`, `.eu.example.com`) — they don't conflict, and a user with cookies for both regions only sends each cookie to its own region.

## Related

- [Plugins → Multi-region](../plugins/multi-region)
- [Concepts → Regions](../core-concepts/regions)
- [Examples → multi-region-routing](../examples/multi-region-routing)
