---
title: HTTP routes
description: Every authfn route, organized by plugin. Auto-generated from the OpenAPI spec.
---

# HTTP routes

This is the canonical list of every operation the kernel exposes when **all plugins are enabled**. If a plugin isn't enabled, its routes simply aren't mounted.

The interactive [API reference](../api) renders the same data with request / response schemas; this page is the at-a-glance index.

## Sessions (built-in)

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `GET` | `/auth/session` | `getSession` | Returns the current session or `AUTHFN_UNAUTHENTICATED`. |
| `GET` | `/auth/sessions` | `listSessions` | Lists all active sessions for the current user. |
| `POST` | `/auth/sessions/{sessionId}/revoke` | `revokeSession` | Revokes a single session. |
| `POST` | `/auth/sign-out` | `signOut` | Revokes the current session. |
| `GET` | `/auth/account` | `getAccountDetails` | Reads the current user's account details. |
| `DELETE` | `/auth/account` | `deleteAccount` | Cascade-deletes the current user. |
| `GET` | `/auth/environment` | `getEnvironment` | Resolved request environment — region id, issuer, base URL, and cookie policy. |

## Password plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/sign-up/password` | `signUpWithPassword` | Sign up with email + password. |
| `POST` | `/auth/sign-in/password` | `signInWithPassword` | Sign in with email + password. Can return `AUTHFN_2FA_REQUIRED`. |
| `POST` | `/auth/password/reset/start` | `startPasswordReset` | Start an OTP-backed password reset. Always 200. |
| `POST` | `/auth/password/reset/complete` | `completePasswordReset` | Complete the reset with code + new password. |

## Email-OTP plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/otp/send` | `sendOtp` | Send a `verify-email`, `sign-in`, or `reset-password` OTP. |
| `POST` | `/auth/otp/verify` | `verifyOtp` | Verify an OTP and (optionally) issue a session. |

## Social-OAuth plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/social/start` | `startSocialSignIn` | Start an OAuth authorization-code flow. |
| `GET` | `/auth/social/callback/{provider}` | `completeSocialSignIn` | Standard OAuth callback. |
| `POST` | `/auth/social/callback/{provider}` | `completeSocialSignInFormPost` | `form_post` callback (Apple). |
| `POST` | `/auth/social/disconnect/{provider}` | `disconnectSocialAccount` | Removes the linked OAuth identity. |
| `POST` | `/auth/social/native/apple/start` | `startNativeAppleSignIn` | Native Apple sign-in handshake start. |
| `POST` | `/auth/social/native/apple/complete` | `completeNativeAppleSignIn` | Native Apple sign-in handshake complete. |

## Two-factor plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/2fa/enroll` | `enrollTwoFactor` | Generate TOTP secret + recovery codes. |
| `POST` | `/auth/2fa/confirm` | `confirmTwoFactor` | Confirm enrollment with a current code. |
| `POST` | `/auth/2fa/disable` | `disableTwoFactor` | Disable 2FA with a current code or recovery code. |
| `POST` | `/auth/2fa/challenge` | `completeTwoFactorChallenge` | Complete a 2FA challenge after `AUTHFN_2FA_REQUIRED`. |

## API-keys plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `GET` | `/auth/api-keys` | `listApiKeys` | List the current user's API keys. |
| `POST` | `/auth/api-keys` | `createApiKey` | Create a new API key — secret returned once. |
| `DELETE` | `/auth/api-keys/{keyId}` | `revokeApiKey` | Revoke an API key. |

## Multi-region plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/regions/lookup` | `lookupRegion` | Look up which region owns an identifier. |

The multi-region plugin also overlays `AUTHFN_REGION_MISMATCH` responses on every other operation when a request lands on the wrong region.

## Native-handoff plugin

| Method | Path | Operation | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/handoff/native/start` | `startNativeHandoff` | Issue a one-time native handoff code. |
| `POST` | `/auth/handoff/native/exchange` | `exchangeNativeHandoff` | Exchange a code for a bearer session. |
| `POST` | `/auth/handoff/web/start` | `startWebHandoff` | Issue a one-time WebView handoff code. |
| `GET` | `/auth/handoff/web/consume` | `consumeWebHandoff` | Consume a WebView handoff code (sets cookies). |

## Admin (separate package)

`@authfn/admin` mounts its own router. See [Admin](../admin).

| Method | Path | Operation |
| --- | --- | --- |
| `GET` | `/admin/users` | `listAuthFnAdminUsers` |
| `DELETE` | `/admin/users/{userId}` | `deleteAuthFnAdminUserById` |
| `DELETE` | `/admin/users` | `deleteAuthFnAdminUsersByEmail` |

## Source of truth

The OpenAPI spec at `content/api/authfn.json` is generated from the kernel's actual route table at build time. Diffs in this table are visible in PRs.
