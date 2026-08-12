---
title: account-settings
description: Post-login UX — two-factor enroll/disable, API-key list/create/revoke, and protected-endpoint authentication via API key.
---

# account-settings

A focused example for the **account settings** UX you'd ship in a consumer app: 2FA enrollment, recovery codes, API key management, and a protected demo endpoint that authenticates via API key.

## What it shows

- Sign-up + sign-in with email and password (entry into settings).
- 2FA enroll → display QR + recovery codes → confirm with a TOTP code.
- 2FA challenge during a subsequent sign-in.
- 2FA disable.
- API key create (with name + scopes) → display the secret once.
- API key list and revoke.
- Calling a protected `/demo/protected` endpoint with the issued key.

## URLs

- Client: `http://127.0.0.1:4013`
- Server: `http://127.0.0.1:4313`

## Routes exercised

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
- `GET /demo/protected` (server-side; uses `auth.provider.authenticate`)

## What's interesting

The TOTP UI shows the **otpauth URI** as a QR code. In production you'd render the URI through a QR library (`qrcode` on the server, `qrcode.svelte` on the client); the example uses a small inline SVG generator so you can copy the pattern.

API key creation is the canonical "show once" pattern: the secret comes back in the response body once, the client renders it inside a copy-to-clipboard widget, and after navigation the secret is gone.

## Running locally

```bash
cd authfn/examples/account-settings
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/authfn_examples_account_settings
npm install
npm --prefix ./server run db:generate
npm --prefix ./server run db:push

npm run dev:server
npm run dev:client
npm run test:e2e
```

## Related

- [Plugins → Two-factor](../plugins/two-factor)
- [Plugins → API keys](../plugins/api-keys)
- [Recipes → Adding 2FA](../recipes/adding-2fa)
- [Recipes → CLI authentication](../recipes/cli-auth)
- [Source on GitHub](https://github.com/21nCo/super-functions/tree/dev/authfn/examples/account-settings)
