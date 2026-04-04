# OTP Recovery

Focused `authfn` example for verify-email OTP, OTP sign-in, and password reset with a deterministic demo inbox.

## URLs

- Client: `http://127.0.0.1:4011`
- Server: `http://127.0.0.1:4311`
- Auth base path: `http://127.0.0.1:4311/auth`

## Local Postgres

Use a local Postgres database, for example:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples
```

The generated auth schema for this example includes `users`, `sessions`, `password_credentials`, and `otp_challenges`.

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

## What Playwright Covers

- Create a password account used by the OTP and recovery flows.
- Send and verify a `verify-email` OTP through the deterministic demo inbox.
- Assert replaying the same verify-email OTP returns `AUTHFN_OTP_REPLAYED`.
- Send an OTP sign-in challenge, assert an invalid code returns `AUTHFN_OTP_INVALID`, then complete OTP sign-in successfully.
- Start password reset, complete it with the demo inbox code, assert the old password fails, and assert the new password succeeds.

## Demo Inbox Contract

- `GET /demo/otp/latest?purpose=verify-email&email=<email>`
- `GET /demo/otp/latest?purpose=sign-in&email=<email>`
- `GET /demo/otp/latest?purpose=reset-password&email=<email>`

Each response returns the canonical example success envelope with `data.message.code`, `data.message.challengeId`, and `data.message.recordedAt`.

## Stable Selectors

Shared selectors come from `@authfn/examples-shared`, including:

- `example-title`
- `auth-state-panel`
- `auth-error-panel`
- `otp-inbox-panel`
- `event-log-panel`
- `sign-up-form`
- `sign-in-form`
- `sign-up-email-input`
- `sign-up-password-input`
- `sign-up-submit-button`
- `sign-in-email-input`
- `sign-in-password-input`
- `sign-in-submit-button`
- `verify-email-send-button`
- `verify-email-code-input`
- `verify-email-submit-button`
- `otp-sign-in-send-button`
- `otp-sign-in-code-input`
- `otp-sign-in-submit-button`
- `password-reset-start-button`
- `password-reset-code-input`
- `password-reset-new-password-input`
- `password-reset-submit-button`
- `refresh-session-button`
- `sign-out-button`
- `refresh-events-button`
