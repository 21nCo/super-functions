---
title: Social OAuth plugin
description: Google, Apple, and GitHub OAuth — plus a resolver hook for custom providers and a native Apple flow for iOS.
---

# Social OAuth plugin

`authFnSocialOAuthPlugin` adds OAuth-based sign-in for the providers you configure. The bundled providers are **Google**, **Apple**, and **GitHub**; you can also add a custom OAuth 2.0 / OpenID provider through a resolver. The plugin handles state generation, token exchange, identity resolution, and account linking.

```ts
import { authFnSocialOAuthPlugin } from '@authfn/core';

authFnSocialOAuthPlugin({
  providers: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowlistedReturnTo: ['https://app.example.com/post-auth'],
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
      nativeClientIds: ['com.example.app'],
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  defaultHandoffMode: 'session-token',
});
```

## Configuration

```ts
interface SocialOAuthPluginConfig {
  providers?: Partial<Record<'google' | 'apple' | 'github', AuthFnSocialProviderConfig>>;
  fetcher?: OAuthFetchLike;
  tokenHttpClient?: OAuthTokenHttpClient;
  now?: () => Date;
  defaultHandoffMode?: 'none' | 'session-token';
}

interface AuthFnSocialProviderConfig {
  clientId?: string;
  clientSecret?: string;
  clientSecretResolver?: OAuthClientSecretResolver;       // fetch from a secrets manager
  allowlistedRedirectUris?: string[];                     // OAuth provider redirect URIs
  allowlistedReturnTo?: string[];                         // post-auth landing pages
  scopes?: string[];                                      // override default scopes
  nativeClientIds?: string[];                             // for native flows (Apple)
  linkByVerifiedEmail?: boolean;                          // override accountLinking.oauthByVerifiedEmail
  profileResolver?: AuthFnSocialProfileResolver;          // custom identity extraction
}
```

| Option | Default | Notes |
| --- | --- | --- |
| `providers` | `{}` | Map of provider id → config. |
| `fetcher` | global `fetch` | Inject a custom fetcher (proxy, instrumentation). |
| `tokenHttpClient` | default | Override the token endpoint client. |
| `defaultHandoffMode` | `'none'` | `'session-token'` lets the callback embed a one-time handoff for native apps. |

## Per-provider deep dives

- [Google](./google) — scopes, prompt parameters, hosted-domain restriction.
- [Apple](./apple) — JWT-based client secret, native Apple flow, the form_post quirk.
- [GitHub](./github) — emails endpoint, organization membership.
- [Custom providers](./custom-providers) — wiring a provider that's not in the bundled set.

## Routes

The plugin mounts the following routes (paths shown relative to the kernel's basePath, typically `/auth`):

| Method | Path | Operation ID | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/social/start` | `startSocialOAuth` | Begin a flow. Body: `{ provider, returnTo, callbackMode? }`. |
| `GET` | `/auth/social/callback/:provider` | `callbackSocialOAuth` | Provider's `redirect_uri` lands here. |
| `POST` | `/auth/social/callback/:provider` | `callbackSocialOAuthForm` | For Apple's `form_post` response_mode. |
| `POST` | `/auth/social/native/apple/start` | `startNativeAppleSignIn` | Native Apple flow start. |
| `POST` | `/auth/social/native/apple/complete` | `completeNativeAppleSignIn` | Native Apple flow complete. |
| `POST` | `/auth/social/disconnect/:provider` | `disconnectSocialOAuth` | Remove a provider's identity from the current user. |

## Handoff mode

When the callback fires *and* the response is destined for a native app (because `defaultHandoffMode: 'session-token'` is set, or `handoffMode: 'session-token'` was supplied at start), the kernel:

1. Issues a session as usual.
2. Creates a one-time handoff code (via the [native handoff plugin](../native-handoff), which must be enabled).
3. Redirects (or returns JSON) with the code instead of a session cookie.

The native app then exchanges the code for a session through `POST /auth/handoff/native/exchange`. This avoids cookie storage in browsers that the native wrapper can't share.

See [Plugins → Native handoff](../native-handoff) for the full flow.

## Schema

The plugin contributes:

| Table | Purpose |
| --- | --- |
| `authfn_oauth_states` | One row per in-flight OAuth flow. Carries the signed state, code verifier, nonce, and intent. |
| `authfn_oauth_accounts` | One row per (user × provider) link. Carries the provider's account id, profile snapshot, scopes. |

## Identity resolution

After a successful token exchange, the plugin resolves the user's identity:

1. If you supplied a `profileResolver`, it runs first.
2. Otherwise, the bundled provider descriptor (Google: `userinfo` endpoint; Apple: identity token claims; GitHub: `user` + `user/emails`) is used.
3. The resolved profile carries `{ providerAccountId, email?, emailVerified?, name?, profile? }`.

If you need to enrich identity (e.g. fetch organizations from GitHub, fetch hosted-domain from Google), use a `profileResolver`:

```ts
profileResolver: async ({ providerId, tokenSet, fetcher }) => {
  const me = await fetcher(`https://api.github.com/user`, {
    headers: { Authorization: `Bearer ${tokenSet.accessToken}` },
  }).then((r) => r.json());
  return {
    providerAccountId: String(me.id),
    email: me.email ?? undefined,
    emailVerified: me.email_verified ?? false,
    name: me.name,
    profile: me,
  };
},
```

## Account linking

By default, OAuth identities for an existing email are *not* automatically linked. To enable, set `accountLinking.oauthByVerifiedEmail: true` (globally) or `linkByVerifiedEmail: true` on the specific provider config. See [Concepts → Account linking](../core-concepts/account-linking).

## Allowlists

Both `allowlistedRedirectUris` and `allowlistedReturnTo` are *exact-match* allowlists with no wildcard support. This is intentional — wildcards are the most common source of OAuth open-redirect vulnerabilities. To allow a family of return targets, list each one explicitly.

## Errors

| Code | When |
| --- | --- |
| `AUTHFN_OAUTH_PROVIDER_UNSUPPORTED` | Provider not configured. |
| `AUTHFN_OAUTH_STATE_INVALID` | State token malformed or expired. |
| `AUTHFN_OAUTH_STATE_REPLAYED` | State token already used. |
| `AUTHFN_OAUTH_CALLBACK_INVALID` | Provider returned an error or callback didn't match. |
| `AUTHFN_REDIRECT_URI_DISALLOWED` | `redirect_uri` or `returnTo` not on the allowlist. |
| `AUTHFN_RATE_LIMITED` | Provider rate-limited the request. |
| `AUTHFN_CONFLICT` | Email already in use; `accountLinking` policy declined. |
| `AUTHFN_2FA_REQUIRED` | OAuth sign-in succeeded but the user has 2FA enrolled. |

## Events

- `authfn.oauth.started`
- `authfn.oauth.completed`
- `authfn.oauth.failed`
- `authfn.user.created` (first-time sign-up)
- `authfn.account_linked` / `authfn.account_linking.conflict`
- `authfn.session.issued`

## Related

- [Concepts → Account linking](../core-concepts/account-linking)
- [Plugins → Native handoff](../native-handoff)
- [Plugins → Two-factor](../two-factor)
- [Recipes → Adding a custom OAuth provider](../recipes/custom-oauth-provider)
- [Examples → social-oauth](../examples/social-oauth)
