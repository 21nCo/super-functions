# AuthFn Account Settings Example

This example isolates post-login account management features:

- password sign-up and sign-in as the entry point into settings
- two-factor enroll, confirm, challenge completion, and disable
- API-key create, list, revoke, and bearer validation against a protected demo endpoint
- deterministic event logging and state reset through the shared example harness

## URLs

- Client: `http://127.0.0.1:4013`
- Server: `http://127.0.0.1:4313`
- Auth base path: `http://127.0.0.1:4313/auth`

## Local Postgres

Use a local Postgres database, for example:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_account_settings
```

## Auth routes exercised

- `POST /auth/sign-up/password`
- `POST /auth/sign-in/password`
- `GET /auth/session`
- `POST /auth/sign-out`
- `POST /auth/2fa/enroll`
- `POST /auth/2fa/confirm`
- `POST /auth/2fa/challenge`
- `POST /auth/2fa/disable`
- `POST /auth/api-keys`
- `GET /auth/api-keys`
- `DELETE /auth/api-keys/:keyId`

## Demo routes exercised

- `POST /demo/reset`
- `GET /demo/events`
- `GET /demo/api-key/protected`

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

- The server uses Postgres + Drizzle and imports auth tables from `src/db/generated/authfn-schema.ts`.
- The checked-in `superfunctions.config.ts` matches the documented shape, and `db:generate` uses the JS runtime wrapper because the current CLI loader executes JS/MJS configs at runtime.
