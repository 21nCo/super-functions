---
title: Google One Tap
description: Hand a Google Identity Services credential to authfn for a frictionless web sign-in.
---

# Google One Tap

## Goal

Show Google's "One Tap" prompt on your sign-in page; on success, exchange the resulting credential for an authfn session.

## Approach

One Tap returns an **ID token JWT** in the browser. To accept it, mount a tiny custom plugin route that:

1. Verifies the JWT against Google's JWKS.
2. Resolves the identity.
3. Calls the kernel's `findOrCreateUser` and `issueSession`.

You can also do this via the existing social-OAuth plugin's `profileResolver`, but One Tap is conceptually outside the standard authorization-code flow — a custom route is cleaner.

## Skeleton

```ts
import { jwtVerify, createRemoteJWKSet } from 'jose';
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export function googleOneTapPlugin(config: { clientId: string }): AuthFnPlugin {
  return {
    name: 'googleOneTap',
    routes: (ctx) => [{
      method: 'POST',
      path: '/oauth/google/one-tap',
      handler: async (request) => {
        const { credential } = await request.json();
        const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
          audience: config.clientId,
          issuer: ['https://accounts.google.com', 'accounts.google.com'],
        });

        const user = await findOrCreateUser(ctx.config, ctx.hooks, {
          providerAccountId: payload.sub,
          email: payload.email as string | undefined,
          emailVerified: Boolean(payload.email_verified),
        });

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: user.id,
          primaryEmail: user.primaryEmail,
          methods: ['oauth-google'],
        });

        return jsonSuccess({ session: issued.session });
      },
    }],
  };
}
```

## Browser-side One Tap

Render the standard Google Identity Services prompt and POST the credential to `/auth/oauth/google/one-tap` on success.

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
<script>
  google.accounts.id.initialize({
    client_id: 'GOOGLE_CLIENT_ID',
    callback: async ({ credential }) => {
      await fetch('/auth/oauth/google/one-tap', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
      });
      window.location.href = '/dashboard';
    },
  });
  google.accounts.id.prompt();
</script>
```

## Account linking

If you want One Tap to link to existing email-or-OAuth users, set `accountLinking.oauthByVerifiedEmail: true`.

## Related

- [Plugins → Social OAuth → Google](../plugins/social-oauth/google)
- [Plugins → Authoring](../plugins/authoring)
