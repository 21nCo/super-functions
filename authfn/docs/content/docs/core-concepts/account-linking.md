---
title: Account linking
description: When authfn merges multiple sign-in methods into a single user, and how to control that policy.
---

# Account linking

A user might sign up with email/password, then later sign in with Google using the same email. Or they sign up with an OTP, then add a password. Should the second sign-in succeed and link to the existing user — or create a new account?

authfn answers this with three explicit policies, each off by default:

```ts
interface AuthFnAccountLinkingConfig {
  oauthByVerifiedEmail?: boolean | {
    providers?: AuthFnSocialProviderId[];
    requireExistingEmailVerified?: boolean;
    requireProviderEmailVerified?: boolean;
  };
  otpSignUpExistingUser?: boolean;
  passwordForAuthenticatedUser?: boolean | {
    requireExistingEmailVerified?: boolean;
  };
}
```

Pass it as `config.accountLinking` to `createAuthFn`.

## `oauthByVerifiedEmail`

Link an OAuth identity to an existing authfn user when both sides prove the same verified email address.

- `false` (default): OAuth sign-in for an email that already exists locally is rejected as `AUTHFN_CONFLICT` unless you ask the user to sign in with their existing method.
- `true`: link if both emails are verified (the local user's email is verified *and* the OAuth provider returned `email_verified=true`).
- Object form: scope the policy to a subset of providers or relax the verification requirements.

```ts
accountLinking: {
  oauthByVerifiedEmail: {
    providers: ['google', 'apple'],          // not GitHub
    requireExistingEmailVerified: true,
    requireProviderEmailVerified: true,
  },
}
```

Provider-level `linkByVerifiedEmail` (set on the social provider config) overrides the global policy. This lets you opt one provider in or out without changing the global default.

## `otpSignUpExistingUser`

Treat OTP sign-up for an already-registered email as a sign-in. The OTP itself is proof of email control, so this is safe under most threat models.

- `false` (default): OTP sign-up for an existing email returns `AUTHFN_CONFLICT`.
- `true`: the OTP succeeds and a session is issued for the existing user.

This is the policy you almost certainly want for OTP-first apps where users may have signed up earlier with a different method.

## `passwordForAuthenticatedUser`

Allow a logged-in user to add a password credential through the password sign-up endpoint, when they don't already have one.

- `false` (default): password sign-up always tries to create a new user.
- `true`: when authenticated and no password credential exists, treat the request as "add password to my account".
- Object form: require the user's email to be verified before allowing the upgrade.

This is how you wire "set a password" inside an OTP-only or OAuth-only sign-up flow.

## Common patterns

### Magic-link first, OAuth-friendly

```ts
accountLinking: {
  otpSignUpExistingUser: true,
  oauthByVerifiedEmail: true,
  passwordForAuthenticatedUser: true,
}
```

A user can:

- sign up with OTP, then sign in via Google later (linking by email),
- add a password later from the account settings page.

### Strict separation

```ts
accountLinking: {
  // all defaults; nothing linked automatically
}
```

A user signing in with a different method on the same email gets `AUTHFN_CONFLICT`. You handle the merge UX yourself.

### OAuth-only, no automatic password upgrade

```ts
accountLinking: {
  oauthByVerifiedEmail: true,
  // passwordForAuthenticatedUser: false (default)
}
```

A user can sign in across all configured OAuth providers, but trying to set a password on an OAuth-only account creates a new account (which will then fail the email-uniqueness check).

## Conflict semantics

When linking is rejected (because the policy doesn't allow it, or verification requirements aren't met), the kernel returns `AUTHFN_CONFLICT` with `details: { reason: 'email_in_use', linkable: <bool> }`. The first-party SDKs surface `linkable` to give you a path to "sign in with your existing method to link".

## Provider-level overrides

In `authFnSocialOAuthPlugin`, each provider config can set:

```ts
{
  google: {
    clientId: '…',
    clientSecret: '…',
    linkByVerifiedEmail: true,                // overrides global
  },
}
```

Provider-level overrides win over the global `oauthByVerifiedEmail`.

## Identity vs profile data

Account linking only links identities — the OAuth row in `authfn_user_identities`, the password credential row in `authfn_user_passwords`, etc. It does *not* mutate the user's profile (`primaryEmail`, custom metadata). If a linked OAuth identity returns a different email than the existing user's `primaryEmail`, the user's `primaryEmail` is unchanged. Use a hook (`afterOAuthCallback`) if you want to record additional emails as alternates.

## Audit

Linking decisions emit observability events:

- `authfn.account_linked` — a successful link.
- `authfn.account_linking.conflict` — a rejection.

Use these to drive your "we noticed you have another account" UX or your audit log.

## Related

- [Plugins → Password](../plugins/password) — `passwordForAuthenticatedUser` semantics.
- [Plugins → Email OTP](../plugins/email-otp) — `otpSignUpExistingUser` semantics.
- [Plugins → Social OAuth](../plugins/social-oauth) — provider-level link config.
- [Recipes → Adding a password to an OAuth account](../recipes/adding-password) — end-to-end flow.
