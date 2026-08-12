---
title: GitHub
description: Configuring GitHub OAuth — emails endpoint, scopes, organization membership.
---

# GitHub

The GitHub provider uses standard OAuth 2.0. The default profile resolver fetches `https://api.github.com/user` plus `https://api.github.com/user/emails` to assemble a verified primary email.

## Setup

1. Create an OAuth App at [GitHub → Developer settings](https://github.com/settings/developers).
2. Authorization callback URL: `https://your-app.com/auth/social/callback/github`.

## Configuration

```ts
authFnSocialOAuthPlugin({
  providers: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      allowlistedRedirectUris: ['https://app.example.com/auth/social/callback/github'],
      scopes: ['read:user', 'user:email'],     // default
    },
  },
});
```

## Why two API calls?

GitHub's `/user` returns the user's *public* email — which is often null. Their *primary* email is exposed only via `/user/emails`, and only when the `user:email` scope was granted. authfn calls both and constructs:

- `email` — the verified primary if available, else the first verified email, else the public email.
- `emailVerified` — `true` when the chosen email's `verified` flag is `true`.

## Restricting to an organization

Add a `profileResolver` that fetches `/user/orgs` and rejects if the user isn't in your allowed orgs:

```ts
import { AuthFnPluginAbortedError } from '@authfn/core';

github: {
  // …
  profileResolver: async ({ tokenSet, fetcher }) => {
    const headers = { Authorization: `Bearer ${tokenSet.accessToken}` };
    const me = await fetcher('https://api.github.com/user', { headers }).then((r) => r.json());
    const orgs = await fetcher('https://api.github.com/user/orgs', { headers }).then((r) => r.json());
    if (!orgs.some((o) => o.login === 'my-org')) {
      throw new AuthFnPluginAbortedError('Sign-in restricted to my-org members', { orgs });
    }
    const emails = await fetcher('https://api.github.com/user/emails', { headers }).then((r) => r.json());
    const primary = emails.find((e) => e.primary && e.verified);
    return {
      providerAccountId: String(me.id),
      email: primary?.email ?? me.email ?? undefined,
      emailVerified: Boolean(primary),
      name: me.name,
      profile: me,
    };
  },
},
```

`/user/orgs` requires the `read:org` scope. Add it to your provider config's `scopes`.

## Emails are not always verified

Treat GitHub email as `emailVerified: false` unless the API explicitly says otherwise. Users can mark an email as unverified and still have it associated with their account.

## Errors specific to GitHub

- `bad_verification_code` typically means a stale code (the user took too long to complete the flow) — bubbles up as `AUTHFN_OAUTH_CALLBACK_INVALID`.
- Rate limits from `api.github.com` bubble up as `AUTHFN_RATE_LIMITED`.
