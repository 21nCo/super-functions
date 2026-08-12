---
title: Adding a custom OAuth provider (Microsoft Entra)
description: Wire authfn to a provider that's not in the bundled set — Microsoft Entra here, but the pattern works for anything.
---

# Adding a custom OAuth provider (Microsoft Entra)

## Goal

Add Microsoft Entra (formerly Azure AD) as a sign-in option without forking authfn.

## Approach

The bundled `authFnSocialOAuthPlugin` covers Google / Apple / GitHub. For anything else, the supported integration path is to **author a small plugin** that mounts its own `/oauth/microsoft/start` and `/oauth/microsoft/callback` routes and uses `@superfunctions/oauth-core` + `@superfunctions/oauth-storage` for state and token handling.

## Skeleton

```ts
import {
  generateStateId,
  consumeStateOrThrow,
  assertCallbackStateMatches,
} from '@superfunctions/oauth-core';
import { DbAdapterOAuthStateStore } from '@superfunctions/oauth-storage';
import { DefaultOAuthTokenHttpClient } from '@superfunctions/oauth-http';
import type { AuthFnPlugin } from '@authfn/core';

export function microsoftPlugin(config: {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  allowlistedReturnTo: string[];
}): AuthFnPlugin {
  return {
    name: 'microsoft',
    schema: () => [/* same shape as oauth_states from oauth-storage */],
    routes: (ctx) => createRoutes(ctx, config),
  };
}

function createRoutes(ctx, config) {
  const stateStore = new DbAdapterOAuthStateStore({
    adapter: ctx.config.database,
    namespace: ctx.namespace,
  });
  const tokenClient = new DefaultOAuthTokenHttpClient();

  return [
    {
      method: 'POST',
      path: '/oauth/microsoft/start',
      handler: async (request) => {
        const body = await request.json();
        if (!config.allowlistedReturnTo.includes(body.returnTo)) {
          throw new AuthFnRedirectUriDisallowedError();
        }
        const stateId = generateStateId();
        await stateStore.put({
          stateId,
          subject: { intent: 'sign-in', returnTo: body.returnTo },
          expiresAt: new Date(Date.now() + 5 * 60_000),
        });
        const url = new URL(`https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize`);
        url.searchParams.set('client_id', config.clientId);
        url.searchParams.set('redirect_uri', `${runtime.baseUrl}/oauth/microsoft/callback`);
        url.searchParams.set('response_type', 'code');
        url.searchParams.set('scope', 'openid email profile');
        url.searchParams.set('state', stateId);
        return Response.redirect(url.toString(), 302);
      },
    },
    {
      method: 'GET',
      path: '/oauth/microsoft/callback',
      handler: async (request) => {
        const url = new URL(request.url);
        const stateId = url.searchParams.get('state')!;
        const state = await consumeStateOrThrow(stateStore, stateId);
        const code = url.searchParams.get('code')!;
        const tokens = await tokenClient.exchange({
          tokenUrl: `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          code,
          redirectUri: `${runtime.baseUrl}/oauth/microsoft/callback`,
        });
        const profile = await fetch('https://graph.microsoft.com/oidc/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }).then((r) => r.json());

        const user = await findOrCreateUser(ctx.config, ctx.hooks, {
          providerAccountId: profile.sub,
          email: profile.email,
          emailVerified: true,
        });

        const issued = await issueSession(ctx.config, ctx.hooks, {
          request,
          userId: user.id,
          primaryEmail: user.primaryEmail,
          methods: ['oauth-microsoft' as any],
        });

        return Response.redirect(state.subject.returnTo, 302);
      },
    },
  ];
}
```

## What's involved

- Implement state storage (the bundled `DbAdapterOAuthStateStore` already does this).
- Generate / verify states.
- Token exchange via `DefaultOAuthTokenHttpClient`.
- Identity extraction via the provider's userinfo endpoint.
- User lookup/creation via `findOrCreateUser` (or implement directly with `users.findOne` / `users.create`).
- Session issuance via the kernel's `issueSession`.

## What's reusable

The OAuth bits (state generation, replay protection, token exchange, secret resolvers, redirect-uri allowlists, error sanitization) live in `@superfunctions/oauth-*`. Your plugin assembles them; the kernel handles sessions and observability.

## Related

- [Plugins → Social OAuth → Custom providers](../plugins/social-oauth/custom-providers)
- [Plugins → Authoring](../plugins/authoring)
