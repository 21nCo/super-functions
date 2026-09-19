---
title: Plugins
description: Every authfn capability is a plugin. Pick the ones you need; skip the rest.
---

# Plugins

authfn ships seven plugins as independent packages. They compose into a single `authfn()` app — pick the ones you need, ignore the rest, and the kernel surface (routes, schema, OpenAPI, observability) tracks your choice.

| Plugin | Package | What it adds | Page |
| --- | --- | --- | --- |
| `authFnPasswordPlugin` | `@authfn/password` | Email + password sign-up, sign-in, reset-via-OTP. | [Password](./password) |
| `authFnEmailOtpPlugin` | `@authfn/email-otp` | One-time codes for email verification, sign-in, sign-up, password reset. | [Email OTP](./email-otp) |
| `authFnSocialOAuthPlugin` | `@authfn/social-oauth` | Google, Apple, GitHub OAuth. Custom providers via a plugin. | [Social OAuth](./social-oauth) |
| `authFnApiKeyPlugin` | `@authfn/api-keys` | User-owned API keys with scopes. | [API keys](./api-keys) |
| `authFnTwoFactorPlugin` | `@authfn/two-factor` | TOTP-based 2FA with recovery codes. | [Two-factor](./two-factor) |
| `authFnMultiRegionPlugin` | `@authfn/multi-region` | Region pinning, lookup, runtime overlays. | [Multi-region](./multi-region) |
| `authFnNativeHandoffPlugin` | `@authfn/native-handoff` | Web ↔ native session handoff. | [Native handoff](./native-handoff) |

The kernel does **not** re-export these factories. Import each plugin from its own package. Schema and policy options go to the plugin factory in `authfn({ plugins })`. Runtime dependencies (delivery, OAuth secrets, encryption keys, clocks) go to `.createServer({ pluginRuntime })`.

If you need something that's not on the list, [author a custom plugin](./authoring) — the contract is small and well-defined.

## Pattern: minimal viable auth

For most apps, the smallest sane set is **password + email-otp** so you have password-based sign-in plus email verification and password reset:

```ts
import { authfn, authFnPlugins } from "authfn";
import { authFnPasswordPlugin } from "@authfn/password";
import { authFnEmailOtpPlugin } from "@authfn/email-otp";

const authApp = authfn({
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
  ),
});

const auth = authApp.createServer({
  database,
  pluginRuntime: {
    emailOtp: {
      delivery: yourDelivery,
    },
  },
});
```

## Pattern: passwordless

If you don't want passwords at all, drop the password plugin and rely on OTP / OAuth:

```ts
const authApp = authfn({
  accountLinking: { otpSignUpExistingUser: true },
  plugins: authFnPlugins(
    authFnEmailOtpPlugin(),
    authFnSocialOAuthPlugin(),
  ),
});

const auth = authApp.createServer({
  database,
  pluginRuntime: {
    emailOtp: { delivery: yourDelivery },
    socialOAuth: {
      providers: {
        google: { clientId, clientSecret, allowlistedReturnTo },
        apple: { clientId, clientSecret },
      },
    },
  },
});
```

The `otpSignUpExistingUser` setting shown above makes OTP for an
already-signed-up email behave as sign-in rather than returning a conflict.

## Pattern: full-stack consumer app

```ts
const authApp = authfn({
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
    authFnSocialOAuthPlugin(),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin(),
  ),
});
```

Pass delivery, OAuth providers, and 2FA encryption under `createServer({ pluginRuntime })`. Add `authFnMultiRegionPlugin` if you need data residency, and `authFnNativeHandoffPlugin` if you ship a mobile wrapper.
