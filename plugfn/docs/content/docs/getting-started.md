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

## Application-owned setup and mounting

Keep construction in a server-only module. The following factory accepts the host's durable database and verified session resolver explicitly:

```ts
import express from "express";
import type { Adapter } from "@superfunctions/db";
import { toExpress } from "@superfunctions/http-express";
import { plugFn, createPlugFnRouter, type PlugFnPrincipal } from "plugfn";
import { githubProvider } from "@plugfn/providers";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export async function createIntegrationApp(
  database: Adapter,
  authenticate: (request: Request) => Promise<PlugFnPrincipal | null>,
) {
  const plug = plugFn({
    database,
    auth: { authenticate },
    baseUrl: required("APP_URL"),
    encryptionKey: required("PLUGFN_ENCRYPTION_KEY"),
    workflows: {
      runtime: { actions: { recordPush: async (context) => ({ event: context.trigger.event }) } },
    },
    integrations: {
      github: {
        clientId: required("GITHUB_CLIENT_ID"),
        clientSecret: required("GITHUB_CLIENT_SECRET"),
      },
    },
  });
  plug.providers.register(githubProvider);
  await plug.ready;
  const app = express();
  // Keep original bytes for webhook signature verification.
  app.use(express.raw({ type: "*/*", limit: "2mb" }));
  app.use("/api/plugfn", toExpress(createPlugFnRouter(plug)));
  return { app, plug };
}
```

Install `express @superfunctions/http-express` as well as the packages above. Call this factory from your host bootstrap, then `app.listen(...)` or mount the returned app in your existing Express server. Provision PlugFn's `getSchema()` tables with the host migration system first. `plug.ready` rejects if persisted workflow triggers cannot be restored; do not report the service ready before it resolves.

`PLUGFN_ENCRYPTION_KEY` is a 32-byte key encoded as 64 hexadecimal characters. Generate and store it once in the deployment's secret manager; changing it without migrating encrypted connection state makes stored credentials unreadable. Set `APP_URL` to the application's public URL. Register the exact callback URI, such as `https://app.example.com/api/plugfn/callback/github`, with the provider and supply that URI when starting the connection.

The host resolver returns an authenticated `userId` and, where applicable, `tenantId`. Returning null denies protected routes. Browser-supplied owner fields do not replace that identity. Continue with [Connections and OAuth](/docs/connections-and-oauth) and [Actions, workflows, and sync](/docs/workflows-and-sync).
