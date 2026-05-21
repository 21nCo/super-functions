---
title: Google
description: Configuring Google OAuth — client setup, scopes, hosted-domain restriction, and one-tap.
---

# Google

The Google provider uses standard OAuth 2.0 + OIDC. authfn fetches the user profile from `https://www.googleapis.com/oauth2/v3/userinfo`.

## Setup

1. Create credentials at [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Application type: **Web application**.
3. Authorized redirect URI: `https://your-app.com/auth/social/callback/google`.
4. (Multi-region) add the redirect URIs for every region authority.

## Configuration

```ts
authFnSocialOAuthPlugin({
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowlistedRedirectUris: [
        'https://app.example.com/auth/social/callback/google',
      ],
      allowlistedReturnTo: [
        'https://app.example.com/post-auth',
      ],
      scopes: ['openid', 'email', 'profile'],     // default; only override if needed
    },
  },
});
```

## Restricting to a hosted domain

For internal apps (Workspace), use a `profileResolver` that asserts the `hd` claim:

```ts
import { AuthFnPluginAbortedError } from '@authfn/core';

google: {
  // …
  profileResolver: async ({ tokenSet, fetcher }) => {
    const me = await fetcher('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenSet.accessToken}` },
    }).then((r) => r.json());
    if (me.hd !== 'mycompany.com') {
      throw new AuthFnPluginAbortedError('Sign-in restricted to mycompany.com', { hd: me.hd });
    }
    return {
      providerAccountId: me.sub,
      email: me.email,
      emailVerified: me.email_verified,
      name: me.name,
      profile: me,
    };
  },
},
```

## One-tap (Google Identity Services)

If you want the Google **One Tap** UI on your sign-in page, generate the credential client-side and hand it to authfn through a custom plugin route — see [Recipes → Google One-tap](../recipes/google-one-tap).

## Scopes

The default scope set is the OIDC minimum: `openid email profile`. Add `https://www.googleapis.com/auth/userinfo.profile` and other Google API scopes only if you'll actually call those APIs on the user's behalf.

## Native Google sign-in

Google's native flow on Android (and iOS, via the Google Sign-In SDK) returns an ID token directly. To accept that token, mount a custom plugin route that calls `auth.provider`'s identity helpers — or, for many cases, simply use the standard web flow inside a system browser tab (recommended by Google for security).

## Errors specific to Google

- `AUTHFN_OAUTH_CALLBACK_INVALID` with `details.providerError = 'invalid_grant'` typically means a stale code or a clock-skew problem. Verify your server clock.
- `AUTHFN_OAUTH_STATE_INVALID` after a long auth flow usually means the state TTL expired. Increase `challengeTtlSeconds` in OAuth state configuration if your sign-in pages take a long time.
