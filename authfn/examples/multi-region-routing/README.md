# AuthFn Multi-Region Routing Example

This example demonstrates local wrong-authority correction across two fixed authorities:

- `http://127.0.0.1:4315` for `us-east-1`
- `http://localhost:4316` for `eu-west-1`

The seeded demo user `ada@example.com` is registered in `eu-west-1`, so the example can show all three multi-region states:

- identifier lookup from the US authority
- canonical `AUTHFN_REGION_MISMATCH` guidance on the wrong authority
- successful sign-in continuation on the correct authority

## URLs

- Client: `http://localhost:4015`
- US authority: `http://127.0.0.1:4315`
- EU authority: `http://localhost:4316`

## Local Postgres

Use a local Postgres database, for example:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_multi_region_routing
```

## Auth routes exercised

- `GET /auth/environment`
- `POST /auth/regions/lookup`
- `POST /auth/sign-in/password`
- `GET /auth/session`

## Demo routes exercised

- `POST /demo/reset`
- `GET /demo/events`

## Scripts

From this directory:

```bash
npm run dev:server
npm run dev:client
npm --prefix ./server run db:generate
npm --prefix ./server run db:push
npm run test:e2e
```

The root example package exposes `dev:server`, `dev:client`, and `test:e2e`. The nested `server` package exposes `db:generate` and `db:push`.

## Notes

- The server listens on both local authorities from one process so Playwright can exercise the same seeded state from two base URLs.
- The checked-in `superfunctions.config.ts` matches the spec deliverable, and `db:generate` uses a JS runtime wrapper because the CLI loader still executes JS/MJS configs.
