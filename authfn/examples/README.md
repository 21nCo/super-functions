# AuthFn Example Portfolio

This folder contains a focused portfolio of `authfn` example apps. Each example isolates one capability so the examples stay readable and the Playwright coverage stays deterministic.

## Portfolio Matrix

| Example | Focus | Client | Server / Auth | Status |
| --- | --- | --- | --- | --- |
| `password-sessions` | Email/password sign-up, sign-in, session list, revoke, sign-out | `http://127.0.0.1:4010` | `http://127.0.0.1:4310` | Implemented |
| `otp-recovery` | Verify-email OTP, OTP sign-in, password reset | `http://127.0.0.1:4011` | `http://127.0.0.1:4311` | Implemented |
| `social-oauth` | Local fake-provider OAuth start, callback, disconnect | `http://127.0.0.1:4012` | `http://127.0.0.1:4312` | Implemented |
| `account-settings` | API keys and two-factor settings | `http://127.0.0.1:4013` | `http://127.0.0.1:4313` | Implemented |
| `multi-region-routing` | Region lookup and wrong-authority correction | `http://localhost:4015` | `http://127.0.0.1:4315` and `http://localhost:4316` | Implemented |
| `shared` | Shared deterministic harness, selectors, demo routes, fake providers, validator CLIs | n/a | n/a | Ready |

## Shared Stack

- Server: Express + `@superfunctions/http-express`
- Client: Svelte 5 + Vite + `@authfn/client` / `@authfn/svelte`
- Auth storage: Postgres + Drizzle
- Auth schema generation: `@superfunctions/cli`
- E2E: Playwright

## Shared Harness

`@authfn/examples-shared` exports:

- `createExampleServer(...)`
- `createDemoRouter(...)`
- `ExampleEventBuffer`
- `ExampleOtpInbox`
- `createOtpInboxDeliveryProvider(...)`
- `createFakeOAuthProvider(...)`
- stable `data-testid` constants and selector helpers
- E2E helpers for `/demo/reset`, `/demo/events`, and `/demo/otp/latest`

The shared demo contract is intentionally small and deterministic:

- `POST /demo/reset`
- `GET /demo/events`
- `GET /demo/otp/latest`
- local fake OAuth provider routes under `/demo/fake-oauth/*`

## Local Postgres

An optional shared Postgres setup lives in `docker-compose.yml`.

Default env convention:

```bash
DATABASE_URL=postgresql://authfn:authfn@127.0.0.1:55432/authfn_examples
```

Start it with:

```bash
docker compose -f authfn/examples/docker-compose.yml up -d
```

## Workspace Layout

Each example root contains:

- `README.md`
- `package.json`
- `playwright.config.ts`
- `server/`
- `client/`
- `e2e/`

The root package is the Playwright/e2e entry point. The nested `server` and `client` workspaces hold the canonical Express and Svelte/Vite stacks used by later phases.

## Verification Matrix

Run the full deterministic suite from the repo root:

```bash
npm --prefix authfn/examples/password-sessions run test:e2e
npm --prefix authfn/examples/otp-recovery run test:e2e
npm --prefix authfn/examples/social-oauth run test:e2e
npm --prefix authfn/examples/account-settings run test:e2e
npm --prefix authfn/examples/multi-region-routing run test:e2e
npm --prefix authfn/examples/shared run validate:ui-contract
npm --prefix authfn/examples/shared run validate:no-external-network
```

Each example README documents the matching `dev:server`, `dev:client`, `db:generate`, `db:push`, and `test:e2e` commands for that example.
