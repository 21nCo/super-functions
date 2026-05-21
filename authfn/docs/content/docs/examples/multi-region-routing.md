---
title: multi-region-routing
description: Two regional authfn servers and a single browser client — region lookup, wrong-authority correction, and successful continuation.
---

# multi-region-routing

A focused example that demonstrates **wrong-authority correction** across two locally-running regional authorities.

## What it shows

- Two authfn servers — one for `us-east-1`, one for `eu-west-1`.
- A browser client connects to both with `createAuthFnRegionalClient`.
- A seeded user `ada@example.com` belongs to `eu-west-1`.
- The client first resolves `ada@example.com`'s region via `POST /auth/regions/lookup`.
- If the user starts a sign-in on the wrong authority, the kernel responds with `AUTHFN_REGION_MISMATCH` and the client follows `details.redirectTo`.
- Sign-in completes on the correct authority and lands a session.

## URLs

- Client: `http://localhost:4015`
- US authority: `http://127.0.0.1:4315`
- EU authority: `http://localhost:4316`

## Routes exercised

- `GET /auth/runtime` (per-region runtime info — region id, authority, cookie domain).
- `POST /auth/regions/lookup` (the cross-region lookup).
- `POST /auth/sign-in/password` (mismatch path on the wrong authority; success path on the right authority).

## What's interesting

The example is set up so that you can hit the US authority with `ada@example.com` and watch the round-trip: lookup → mismatch → redirect → success. It's the smallest possible reproduction of "the user signed up in EU; their browser landed on US first; the system handled it cleanly without their knowledge."

The two servers share a single Postgres database for simplicity, but each only "owns" its region. The lookup store is a globally-shared table with a unique constraint on `identifier` — `putIfAbsent` is a `INSERT ... ON CONFLICT DO NOTHING ... RETURNING`.

## Running locally

```bash
cd authfn/examples/multi-region-routing
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_multi_region_routing
npm install
npm --prefix ./server run db:generate
npm --prefix ./server run db:push

# In separate terminals:
npm run dev:server-us   # http://127.0.0.1:4315
npm run dev:server-eu   # http://localhost:4316
npm run dev:client      # http://localhost:4015

npm run test:e2e
```

## Related

- [Plugins → Multi-region](../plugins/multi-region)
- [Concepts → Regions](../core-concepts/regions)
- [Recipes → Multi-region deployment](../recipes/multi-region-deployment)
- [Source on GitHub](https://github.com/21nCo/super-functions/tree/dev/authfn/examples/multi-region-routing)
