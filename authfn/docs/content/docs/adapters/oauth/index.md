---
title: OAuth adapters
description: Bundled OAuth providers and how to extend.
---

# OAuth adapters

OAuth is wired through the social-OAuth plugin. authfn ships first-class support for **Google**, **Apple**, and **GitHub**, plus a `profileResolver` extension point for any OIDC / OAuth 2.0 provider you need.

| Provider | Setup |
| --- | --- |
| Google | [Plugins → Social OAuth → Google](../plugins/social-oauth/google) |
| Apple | [Plugins → Social OAuth → Apple](../plugins/social-oauth/apple) |
| GitHub | [Plugins → Social OAuth → GitHub](../plugins/social-oauth/github) |
| Anything else | [Plugins → Social OAuth → Custom providers](../plugins/social-oauth/custom-providers) |

Provider descriptors (the URLs, default scopes, profile-resolution code) live in `@superfunctions/oauth-providers`. The bundled descriptors are the reference implementation; you can author your own and pass them through a custom registry. See [Recipes → Adding a custom OAuth provider](../recipes/custom-oauth-provider) for an end-to-end Microsoft Entra walkthrough.
