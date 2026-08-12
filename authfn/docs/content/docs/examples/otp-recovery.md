---
title: otp-recovery
description: Verify-email OTP, OTP sign-in, password reset via OTP, with a deterministic demo inbox for Playwright assertions.
---

# otp-recovery

A focused example that exercises the **email-OTP plugin** end-to-end across all three of its purposes.

## What it shows

- Verify-email OTP — confirm a user's email address after sign-up.
- OTP sign-in — `purpose: 'sign-in'`; magic-link-style.
- Password reset via OTP — `purpose: 'reset-password'`.

The example runs against a **local OTP inbox** (`ExampleOtpInbox` in `@authfn/examples-shared`) so tests can read the generated OTPs deterministically without ever sending real mail.

## URLs

- Client: `http://127.0.0.1:4011`
- Server: `http://127.0.0.1:4311`

## Stack

Same as [password-sessions](./password-sessions), with `authFnEmailOtpPlugin` added and the example's `delivery` provider wired to the local inbox.

## Running locally

```bash
cd authfn/examples/otp-recovery
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples
npm install
npm --prefix ./server run db:generate
npm --prefix ./server run db:push

npm run dev:server
npm run dev:client
npm run test:e2e
```

## What's interesting

The OTP **demo inbox** is a stand-in for a real mail provider. It exposes `GET /demo/otp/latest` which returns the most recently generated OTP for the requested email. This is the pattern you'll want for your *own* tests — never actually send mail; let the kernel do its thing and capture the OTP via your delivery provider's metadata.

```ts
// example: fetching the OTP in a Playwright test
const code = await fetch(`http://localhost:4311/demo/otp/latest?email=${email}`)
  .then((r) => r.json())
  .then((d) => d.code);

await page.fill('[data-testid=otp-code]', code);
```

## Related

- [Plugins → Email OTP](../plugins/email-otp)
- [Recipes → Magic link sign-in](../recipes/magic-link)
- [Recipes → Email verification](../recipes/email-verification)
- [Source on GitHub](https://github.com/21nCo/super-functions/tree/dev/authfn/examples/otp-recovery)
