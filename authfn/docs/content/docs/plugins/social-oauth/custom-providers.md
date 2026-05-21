---
title: Custom OAuth providers
description: How to add a provider that's not in the bundled set — Microsoft, GitLab, Discord, Slack, your own IdP.
---

# Custom OAuth providers

The bundled providers (`google`, `apple`, `github`) cover most consumer use cases. For everything else — Microsoft, GitLab, Discord, Slack, Atlassian, an in-house IdP — you have two integration paths.

## Path 1: profileResolver + provider descriptor (recommended)

Most OAuth 2.0 / OIDC providers can be reduced to "fetch the user's profile from a known endpoint with the access token". For those, write a custom plugin that wraps `authFnSocialOAuthPlugin`'s primitives — or, more simply, mount your own routes that call the kernel's user/session helpers directly.

A complete custom provider plugin generally:

1. Mounts a `/oauth/<provider>/start` and `/oauth/<provider>/callback` route.
2. Generates an OAuth state through `@superfunctions/oauth-core`.
3. Persists state in `authfn_oauth_states` (use `@superfunctions/oauth-storage`'s adapters).
4. After token exchange, resolves the identity (`providerAccountId`, `email`, `emailVerified`, `name`).
5. Calls into the kernel's user lookup / create / link logic.
6. Issues a session.

This is the same shape `authFnSocialOAuthPlugin` itself uses internally. See [Plugins → Authoring](../authoring) for a step-by-step walkthrough; the [`packages/oauth-providers` source](https://github.com/21nCo/super-functions/tree/dev/packages/oauth-providers) is the reference implementation.

## Path 2: profileResolver on an aliased bundled provider

If the provider is a vanilla OAuth 2.0 + OIDC (think: every Microsoft Entra tenant), you can sometimes alias it onto a bundled provider by overriding the `profileResolver` and pointing it at the right endpoints. The trade-off is the URLs in the OpenAPI document still say `google`/`apple`/`github`, which is misleading.

This path is supported but not recommended for production.

## Provider descriptor extensibility

`authFnSocialOAuthPlugin` reads provider descriptors from `@superfunctions/oauth-providers`. Adding a new descriptor (e.g. `microsoft`, `slack`) is a matter of:

1. Implementing `OAuthProviderPolicy` with the provider's authorization URL, token URL, scopes, and identity-resolution logic.
2. Registering it in `createDefaultProviderPolicyRegistry()` (or by passing a custom registry).

We're working toward a public API for adding policies without touching `oauth-providers`. Track the issue at [GitHub → Issues](https://github.com/21nCo/super-functions/issues).

## When in doubt

If you find yourself fighting the kernel to add a custom provider, write the plugin from scratch instead. Plugins are first-class — they can:

- own their own schema tables,
- emit their own observability events,
- declare their own routes and OpenAPI surface,
- run their own hook chain.

The kernel's job is to issue sessions and broadcast events. Anything else is fair game.

## Related

- [Plugins → Authoring](../authoring) — full plugin authoring guide.
- [Recipes → Adding a custom OAuth provider](../recipes/custom-oauth-provider) — end-to-end walkthrough for Microsoft Entra.
