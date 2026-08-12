---
title: password-sessions
description: Email/password sign-up, sign-in, current-session fetch, multi-device session listing, single-session revoke, and sign-out.
---

# password-sessions

A focused example that exercises the **password plugin** + **session lifecycle** end-to-end.

## What it shows

- Sign-up with email and password.
- Sign-in with the same credentials.
- Reading the current session.
- Listing all active sessions for the current user (multi-device view).
- Revoking a single session by id.
- Signing out (revokes the current session) and "sign out everywhere" (revokes all sessions).

## URLs

- Client: `http://127.0.0.1:4010`
- Server: `http://127.0.0.1:4310`
- Auth base path: `http://127.0.0.1:4310/auth`

## Stack

| Layer | Choice |
| --- | --- |
| Server | Express + `@superfunctions/http-express` |
| Auth kernel | `@authfn/core` with `authFnPasswordPlugin` |
| Database | Postgres + Drizzle |
| Schema generation | `@superfunctions/cli` |
| Client | Svelte 5 + Vite |
| Client SDK | `@authfn/client` + `@authfn/svelte` |
| Tests | Playwright |

The auth tables are namespaced `authfn_password_sessions_*` so multiple examples can coexist in the same database.

## Running locally

```bash
cd authfn/examples/password-sessions
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples
npm install
npm --prefix ./server run db:generate
npm --prefix ./server run db:push

npm run dev:server     # http://127.0.0.1:4310
npm run dev:client     # http://127.0.0.1:4010
npm run test:e2e
```

## What's interesting

The example is a clean reference for the **multi-device session UI**: the client lists every session with its `methods`, `createdAt`, `lastAuthenticatedAt`, and `expiresAt`, and lets the user revoke any of them. This pattern is what almost every app's "Account → Active sessions" page looks like — copy and adapt.

## Related

- [Plugins → Password](../plugins/password)
- [Concepts → Sessions](../core-concepts/sessions)
- [SDKs → Client](../sdk/client)
- [Source on GitHub](https://github.com/21nCo/super-functions/tree/dev/authfn/examples/password-sessions)
