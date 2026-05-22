---
title: Plugins
description: Every authfn capability is a plugin. Pick the ones you need; skip the rest.
---

# Plugins

authfn ships seven plugins out of the box. They compose into a single `AuthFn` instance — pick the ones you need, ignore the rest, and the kernel surface (routes, schema, OpenAPI, observability) tracks your choice.

| Plugin | What it adds | Page |
| --- | --- | --- |
| `authFnPasswordPlugin` | Email + password sign-up, sign-in, reset-via-OTP. | [Password](./password) |
| `authFnEmailOtpPlugin` | One-time codes for email verification, sign-in, sign-up, password reset. | [Email OTP](./email-otp) |
| `authFnSocialOAuthPlugin` | Google, Apple, GitHub OAuth. Custom providers via resolver. | [Social OAuth](./social-oauth) |
| `authFnApiKeyPlugin` | User-owned API keys with scopes. | [API keys](./api-keys) |
| `authFnTwoFactorPlugin` | TOTP-based 2FA with recovery codes. | [Two-factor](./two-factor) |
| `authFnMultiRegionPlugin` | Region pinning, lookup, runtime overlays. | [Multi-region](./multi-region) |
| `authFnNativeHandoffPlugin` | Web ↔ native session handoff. | [Native handoff](./native-handoff) |

If you need something that's not on the list, [author a custom plugin](./authoring) — the contract is small and well-defined.

## Pattern: minimal viable auth

For most apps, the smallest sane set is **password + email-otp** so you have password-based sign-in plus email verification and password reset:

```ts
plugins: [
  authFnPasswordPlugin(),
  authFnEmailOtpPlugin({ delivery: yourDelivery }),
]
```

## Pattern: passwordless

If you don't want passwords at all, drop the password plugin and rely on OTP / OAuth:

```ts
plugins: [
  authFnEmailOtpPlugin({ delivery: yourDelivery }),
  authFnSocialOAuthPlugin({ providers: { google, apple } }),
]
```

You'll likely also want `accountLinking.otpSignUpExistingUser: true` so OTP for an already-signed-up email is treated as sign-in.

## Pattern: full-stack consumer app

```ts
plugins: [
  authFnPasswordPlugin(),
  authFnEmailOtpPlugin({ delivery }),
  authFnSocialOAuthPlugin({ providers }),
  authFnApiKeyPlugin(),
  authFnTwoFactorPlugin(),
]
```

Add `authFnMultiRegionPlugin` if you need data residency, and `authFnNativeHandoffPlugin` if you ship a mobile wrapper.
