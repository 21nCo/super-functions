---
title: social-oauth
description: OAuth start, callback, and disconnect — with a local fake provider so the example doesn't need real third-party credentials.
---

# social-oauth

A focused example that exercises the **social-OAuth plugin** without ever touching a real OAuth provider.

## What it shows

- Sign in with Google, Apple, or GitHub (UI-wise).
- The kernel handles `/auth/social/start`, `/auth/social/callback/:provider`, and `/auth/social/disconnect/:provider`.
- Redirects go to a **local fake provider** (`@authfn/examples-shared`'s `createFakeOAuthProvider`) so no internet access is needed.
- Server rewrites token-exchange URLs to point to the local fake provider.
- Disconnect flow removes the OAuth identity from the user.
- A "disallowed `returnTo`" failure path is exercised to verify allowlist behavior.

## URLs

- Client: `http://127.0.0.1:4012`
- Server: `http://127.0.0.1:4312`
- Auth base path: `http://127.0.0.1:4312/auth`
- Fake providers: under `/demo/fake-oauth/<provider>/*`

## Why a fake provider?

Real OAuth credentials are vendor-specific and come and go. To keep the example deterministic and CI-friendly:

- The fake provider mints valid OIDC-style ID tokens (signed by a key the example trusts).
- The kernel sees the same shape it would see from Google / Apple / GitHub — same scopes, same claims, same identity resolution.
- All HTTP calls stay on `127.0.0.1`. There's a `validate:no-external-network` test that asserts no outbound connections were made.

Use this approach for your own integration tests if you don't want to depend on the live OAuth providers' availability.

## Running locally

```bash
cd authfn/examples/social-oauth
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_social_oauth
npm install
npm --prefix ./server run db:generate
npm --prefix ./server run db:push

npm run dev:server
npm run dev:client
npm run test:e2e
```

## Related

- [Plugins → Social OAuth](../plugins/social-oauth)
- [Recipes → Adding a custom OAuth provider](../recipes/custom-oauth-provider)
- [Source on GitHub](https://github.com/21nCo/super-functions/tree/dev/authfn/examples/social-oauth)
