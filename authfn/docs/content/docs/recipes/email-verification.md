---
title: Email verification
description: Verify a user's email after sign-up. Copy-paste recipe.
---

# Email verification

## Goal

Confirm that a newly signed-up user controls the email address they gave you. Until they verify, mark `emailVerifiedAt: null`. Optionally, gate parts of the app behind verification.

## Plugins

- `authFnEmailOtpPlugin` (purpose: `'verify-email'`).

## Server flow

```ts
// 1. After sign-up:
await client.sendOtp({ email, purpose: 'verify-email' });
// 2. User receives email, enters code in your UI:
await client.verifyOtp({ email, code, purpose: 'verify-email' });
// 3. authfn marks emailVerifiedAt = now.
```

The kernel sets `authfn_users.emailVerifiedAt` on a successful `verify-email` OTP. Read it from `getAccountDetails()`:

```ts
const account = await client.getAccountDetails();
if (account.ok) {
  const verified = account.data.user.emailVerifiedAt !== null;
}
```

## Gating routes by verification

Use a hook to gate sign-in:

```ts
authFnPasswordPlugin({ requireEmailVerifiedForSignIn: true })
```

…or check yourself from your application code:

```ts
const session = await auth.provider.authenticate(request);
if (!account.user.emailVerifiedAt) {
  return redirect('/verify-email');
}
```

## Related

- [Plugins → Email OTP](../plugins/email-otp)
- [Plugins → Password](../plugins/password)
