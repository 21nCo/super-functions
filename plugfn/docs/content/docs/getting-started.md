---
title: Getting started
description: Configure a TypeScript runtime and mount owned routes.
---

# Getting started

Install the runtime, provider package, and shared adapters:

```sh
npm install plugfn @plugfn/providers @plugfn/client @superfunctions/db @superfunctions/http
```

```ts
import { createPlugFnRouter, plugFn } from "plugfn";
import { githubProvider } from "@plugfn/providers";

const plug = plugFn({
  database: adapter,
  auth: authProvider,
  baseUrl: "https://app.example.com",
  encryptionKey: process.env.ENCRYPTION_KEY!,
  integrations: { github: { clientId: process.env.GITHUB_CLIENT_ID!, clientSecret: process.env.GITHUB_CLIENT_SECRET! } },
});
plug.providers.register(githubProvider);
const router = createPlugFnRouter(plug);
```

Supply a durable database adapter, a real authentication provider, and secrets from the deployment environment. Mount the router through a `@superfunctions/http` framework adapter under an application path such as `/api/plugfn`. The [source setup guide](https://github.com/21nCo/super-functions/blob/dev/plugfn/docs/getting-started.md) has Express, Fastify, and Hono examples plus the full route list.
