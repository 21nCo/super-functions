---
title: Adding a password to an OAuth or OTP account
description: Let an authenticated user opt in to passwords without creating a new account.
---

# Adding a password to an OAuth or OTP account

## Goal

A user signed up with Google (or via OTP) and now wants to set a password. Without configuration, the kernel would treat their password sign-up as a *new* account — and fail with `AUTHFN_CONFLICT` because the email is taken.

## Configuration

Enable account linking for the password plugin:

```ts
createAuthFn({
  // ...
  accountLinking: {
    passwordForAuthenticatedUser: true,
    // or, with stricter requirements:
    // passwordForAuthenticatedUser: { requireExistingEmailVerified: true },
  },
});
```

## Client flow

While the user is signed in, call `signUpWithPassword` with their own email:

```ts
await client.signUpWithPassword({
  email: currentUser.primaryEmail,
  password: newPassword,
});
```

The kernel sees:

1. The request is authenticated.
2. The account has no password credential yet.
3. Account-linking policy allows the upgrade.

…and **adds** a `password_credential` row instead of creating a new user.

## What if the user already has a password?

The kernel rejects with `AUTHFN_CONFLICT`. To change an existing password, use the [password reset](./password-reset) flow.

## Related

- [Concepts → Account linking](../core-concepts/account-linking)
- [Plugins → Password](../plugins/password)
