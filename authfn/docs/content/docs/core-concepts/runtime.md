---
title: Runtime resolver
description: How authfn decides per-request issuer, base URL, OAuth credentials, and cookie domain — and how to take control of that decision.
---

# Runtime resolver

The runtime resolver is authfn's per-request configuration hook. Before any plugin runs, the kernel calls `environment.resolve(request)` to compute the **environment** — a snapshot of the configuration that's relevant for *this specific request*.

The resolution carries:

- `issuer` — used in OAuth flows and other URLs the kernel emits.
- `baseUrl` — used to build redirect URIs, OAuth `redirect_uri`s, and links.
- `regionId` — the active region (when multi-region is enabled).
- `cookie` — partial overrides for cookie domain, prefix, secure, sameSite, max-ages.
- `oauth` — partial overrides for `google` / `apple` / `github` provider configs.

The resolution is per-request, not per-server. Two requests against the same kernel instance can resolve to different issuers, base URLs, regions, cookie domains, and OAuth credentials.

## Default behavior

If you don't configure `environment`, authfn defaults to:

```ts
{
  issuer: new URL(request.url).origin,
  baseUrl: new URL(request.url).origin,
}
```

That means: with no resolver, every URL the kernel emits matches the request's origin. This is correct for almost every single-region deployment.

## When you need a custom resolver

You need a custom resolver when:

- **You're behind a reverse proxy / TLS terminator** that rewrites the inbound URL. The kernel sees `http://internal:3000` but you want `https://api.example.com` in OAuth `redirect_uri`s.
- **You serve multiple tenants** on different domains and want each tenant's OAuth client IDs.
- **You're multi-region** and want different cookie domains, OAuth credentials, or issuer per region.
- **You need a different `issuer`** for OIDC-related URLs (e.g. matching what's on file with an upstream IdP).

## Configuring a resolver

```ts
import type { AuthFnEnvironmentResolver } from 'authfn';

const environment: AuthFnEnvironmentResolver = {
  async resolve(request) {
    const url = new URL(request.url);
    const host = url.hostname;

    if (host.endsWith('.eu.example.com')) {
      return {
        issuer: 'https://api.eu.example.com',
        baseUrl: 'https://api.eu.example.com',
        regionId: 'eu-west-1',
        cookie: { domain: '.eu.example.com' },
        oauth: {
          google: { clientId: process.env.GOOGLE_EU_CLIENT_ID, clientSecret: process.env.GOOGLE_EU_CLIENT_SECRET },
        },
      };
    }

    return {
      issuer: 'https://api.example.com',
      baseUrl: 'https://api.example.com',
      regionId: 'us-east-1',
      cookie: { domain: '.example.com' },
      oauth: {
        google: { clientId: process.env.GOOGLE_US_CLIENT_ID, clientSecret: process.env.GOOGLE_US_CLIENT_SECRET },
      },
    };
  },
};

authApp.createServer({ database, environment, pluginRuntime: { /* … */ } });
```

The resolver runs on every request — it should be fast (constant-time). Cache anything expensive outside the resolver.

## Composition with the multi-region plugin

Enabling `authFnMultiRegionPlugin()` does not wrap or merge an arbitrary custom
runtime resolver. Region-aware resolution is explicit: construct the
server's resolver with `authFnMultiRegionEnvironment(...)` and pass it as
`createServer({ environment })`. That resolver selects a configured region from
the request host (or `defaultRegionId`) and returns its `regionId`, authority,
cookie, and OAuth settings.

If you need tenant- or proxy-specific behavior in addition to multi-region
routing, incorporate it into the values passed to
`authFnMultiRegionEnvironment` or put it in front of AuthFn. Do not configure a
separate resolver expecting the plugin to overlay it automatically. See
[Plugins → Multi-region](../plugins/multi-region) for the runnable setup.

## What plugins see

Every route handler can resolve the environment through `resolveEnvironment`:

```ts
import { resolveEnvironment } from "authfn/core/environment";

routes(ctx) {
  return [{
    method: "POST",
    path: "/sign-in/password",
    async handler(request) {
      const environment = await resolveEnvironment(ctx.config, request);
      // environment.baseUrl, environment.cookie?.domain, environment.oauth, …
    },
  }];
}
```

Hooks receive it as `ctx.environment`:

```ts
hooks: {
  beforeUserCreate(ctx, input) {
    if (ctx.environment?.regionId === 'sandbox') {
      input.metadata = { ...input.metadata, sandbox: true };
    }
    return input;
  },
}
```

## What about `request.headers.get('x-forwarded-host')`?

authfn does *not* trust forwarded headers automatically. If your reverse proxy strips them, the default resolver sees the internal URL. Two clean approaches:

- **Resolver-based.** Read your forwarded headers in `environment.resolve(request)` and rewrite `baseUrl` / `issuer` before returning.
- **Adapter-based.** Many of the `@superfunctions/http-*` adapters (e.g. `@superfunctions/http-next`) construct the inbound `Request` from the framework's parsed URL, which already accounts for forwarding. Picking the adapter that does this means you don't need a resolver.

Either is correct. The runtime resolver is the more flexible mechanism if you ever want to extend further (per-tenant OAuth, etc.).

## Sandbox / local development

For local development behind `vite dev` or `next dev`, the default behavior usually works. If you're testing OAuth flows against a tunneled URL (`https://your-app.ngrok.dev`), you'll want to either set `environment.resolve` to return the tunnel URL as `baseUrl` / `issuer` or trust the appropriate forwarded headers in your resolver.

## Custom OAuth client IDs per resolver

```ts
environment: {
  resolve(request) {
    const url = new URL(request.url);
    const tenantId = url.hostname.split('.')[0];
    return {
      issuer: url.origin,
      baseUrl: url.origin,
      oauth: {
        google: {
          clientId: tenantsById[tenantId].googleClientId,
          clientSecretResolver: tenantsById[tenantId].googleSecretResolver,
        },
      },
    };
  },
}
```

`clientSecretResolver` is a function (not a string) so you can fetch the secret from a secrets manager rather than baking it into config. See [Plugins → Social OAuth](../plugins/social-oauth) for the resolver shape.

## Related

- [Cookies](./cookies) — what the environment's `cookie` overlay overrides.
- [Regions](./regions) — multi-region overlay.
- [Plugins → Social OAuth](../plugins/social-oauth) — environment `oauth` shape.
- [Frameworks](../frameworks) — adapter-specific notes on inbound URL construction.
