# @authfn/core

`@authfn/core` is the authfn session and identity kernel for the Superfunctions ecosystem. It composes browser-session auth, password auth, email OTP, social OAuth, API keys, 2FA, multi-region routing, shared OpenAPI generation, and `@superfunctions/auth` provider integration without duplicating shared HTTP, DB, or OAuth primitives.

## What It Ships

- Cookie-backed browser sessions with CSRF protection
- Bundled plugins for:
  - password sign-up/sign-in
  - email OTP send/verify and password reset
  - Google, Apple, and GitHub social sign-in
  - user-owned API keys
  - TOTP-based 2FA
  - multi-region lookup and runtime overlays
- Shared OpenAPI generation through `@superfunctions/http-openapi`
- Structured lifecycle events through `config.observability.emit(...)`

## Package Inventory

- `@authfn/core`
  - core runtime, router composition, schema generation, provider integration
- `@authfn/client`
  - typed browser client using cookie credentials by default
- `@authfn/svelte`
  - thin Svelte stores over the browser client

## Quick Start

```ts
import { memoryAdapter } from '@superfunctions/db/testing';
import {
  authFnEmailOtpPlugin,
  authFnMultiRegionPlugin,
  authFnPasswordPlugin,
  authFnSocialOAuthPlugin,
  authFnTwoFactorPlugin,
  createAuthFn
} from '@authfn/core';

const auth = createAuthFn({
  database: memoryAdapter({ debug: false }),
  namespace: 'authfn',
  openApi: {
    title: 'AuthFn API',
    version: '1.0.0'
  },
  observability: {
    emit(event) {
      console.log(event.type, event.requestId);
    }
  },
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({
      delivery: {
        async send(input) {
          return { sent: true, metadata: { channel: input.channel } };
        }
      }
    }),
    authFnSocialOAuthPlugin({
      providers: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          allowlistedReturnTo: ['https://app.example.com/post-auth']
        }
      }
    }),
    authFnTwoFactorPlugin(),
    authFnMultiRegionPlugin()
  ]
});
```

Consumers mount `auth.router` with a `@superfunctions/http` adapter and use `auth.provider` anywhere an `@superfunctions/auth` provider is expected.

## Route Surface

Base routes:

- `GET /auth/session`
- `GET /auth/sessions`
- `POST /auth/sign-out`
- `POST /auth/sessions/:sessionId/revoke`

Password routes:

- `POST /auth/sign-up/password`
- `POST /auth/sign-in/password`
- `POST /auth/password/reset/start`
- `POST /auth/password/reset/complete`

OTP routes:

- `POST /auth/otp/send`
- `POST /auth/otp/verify`

Social routes:

- `POST /auth/social/start`
- `GET /auth/social/callback/:provider`
- `POST /auth/social/disconnect/:provider`

API key routes:

- `POST /auth/api-keys`
- `GET /auth/api-keys`
- `DELETE /auth/api-keys/:keyId`

2FA routes:

- `POST /auth/2fa/enroll`
- `POST /auth/2fa/confirm`
- `POST /auth/2fa/challenge`
- `POST /auth/2fa/disable`

Multi-region routes:

- `POST /auth/regions/lookup`
- `GET /auth/runtime`

## OpenAPI

OpenAPI output is generated through the shared packages layer, not by authfn-specific code:

```ts
const document = auth.openApi?.();
```

The generated document is deterministic and includes auth-prefixed paths like:

- `/auth/session`
- `/auth/sign-up/password`
- `/auth/sign-in/password`
- `/auth/otp/send`
- `/auth/social/start`

## Observability

Provide `config.observability.emit(event)` to receive structured lifecycle events. The current event surface includes:

- `authfn.user.created`
- `authfn.session.issued`
- `authfn.session.revoked`
- `authfn.otp.sent`
- `authfn.otp.verified`
- `authfn.oauth.started`
- `authfn.oauth.completed`
- `authfn.api_key.created`
- `authfn.api_key.revoked`
- `authfn.2fa.enabled`
- `authfn.2fa.challenged`
- `authfn.region.lookup`
- `authfn.plugin.failed`

Sensitive values such as passwords, OTP codes, API key secrets, and OAuth tokens are redacted or omitted from emitted events.

## Notes

- `authfn` does not bundle framework adapters. Use the shared `@superfunctions/http-*` adapters directly.
- `authfn` does not bundle email or SMS delivery. Plug a provider in through the OTP delivery interface today, or layer `sendfn` in at the application boundary.
- Migration and cutover planning from Better Auth is intentionally out of scope for this spec bundle.
