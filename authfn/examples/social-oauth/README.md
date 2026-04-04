# AuthFn Social OAuth Example

This example demonstrates focused social sign-in flows without any real third-party credentials. The browser stays local to the repo:

- `authfn` handles the real `/auth/social/start`, `/auth/social/callback/:provider`, and `/auth/social/disconnect/:provider` routes.
- The client redirects to the shared fake authorize routes under `/demo/fake-oauth/:provider/authorize`.
- The server rewrites provider token and revoke HTTP calls to the local fake provider routes, and resolves profiles from `/demo/fake-oauth/:provider/userinfo`.

## URLs

- Client: `http://127.0.0.1:4012`
- Server: `http://127.0.0.1:4312`
- Auth base path: `http://127.0.0.1:4312/auth`

## Local Postgres

Use a local Postgres database, for example:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_social_oauth
```

The example imports its auth tables from `server/src/db/generated/authfn-schema.ts`.

## Included flows

- Google, GitHub, and Apple start buttons
- Redirect callback completion back into the browser app
- Disconnect for the currently linked provider
- Disallowed `returnTo` failure path for Playwright verification

## Fake provider routes

- `GET /demo/fake-oauth/google/authorize`
- `POST /demo/fake-oauth/google/token`
- `GET /demo/fake-oauth/google/userinfo`
- `GET /demo/fake-oauth/github/authorize`
- `POST /demo/fake-oauth/github/token`
- `GET /demo/fake-oauth/github/userinfo`
- `GET /demo/fake-oauth/apple/authorize`
- `POST /demo/fake-oauth/apple/token`
- `GET /demo/fake-oauth/apple/userinfo`

## Allowlisted return targets

- `http://127.0.0.1:4012/?provider=google&flow=social`
- `http://127.0.0.1:4012/?provider=github&flow=social`
- `http://127.0.0.1:4012/?provider=apple&flow=social`

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

- The provider token and revoke URLs are intentionally real provider-shaped URLs, but the example server intercepts them locally and rejects unexpected non-local fallback requests with `AUTHFN_EXAMPLE_EXTERNAL_NETWORK_FORBIDDEN`.
- The invalid redirect flow intentionally uses a disallowed `https://evil.example.com/callback` return target as a deterministic negative-path fixture; it is rejected before any external request is made.
