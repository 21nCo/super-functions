---
title: Getting Started
description: Install authfn, configure a server with your first plugins, and sign in a user.
---

# Getting Started

This guide walks through a minimal end-to-end authfn setup: install the packages, create an `AuthFn` instance with the plugins you want, mount it on your existing HTTP framework, and call it from a client.

## 1. Install the packages

You'll typically want the server kernel and the matching client SDK:

```bash
npm install @authfn/core @authfn/client
```

For Svelte apps, also install:

```bash
npm install @authfn/svelte
```

For Python servers, install from PyPI:

```bash
pip install authfn
```

## 2. Create the server runtime

`createAuthFn()` composes a database adapter, your chosen plugins, and observability into a single runtime. Plugins are opt-in — only the auth methods you enable are exposed.

```ts
import { memoryAdapter } from "@superfunctions/db/testing";
import {
  createAuthFn,
  authFnPasswordPlugin,
  authFnEmailOtpPlugin,
  authFnSocialOAuthPlugin,
} from "@authfn/core";

const auth = createAuthFn({
  database: memoryAdapter({ debug: false }),
  namespace: "authfn",
  openApi: {
    title: "AuthFn API",
    version: "1.0.0",
  },
  observability: {
    emit(event) {
      console.log(event.type, event.requestId);
    },
  },
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({
      delivery: {
        async send(input) {
          // hand off to your mail provider here
          return { sent: true, metadata: { channel: input.channel } };
        },
      },
    }),
    authFnSocialOAuthPlugin({
      providers: {
        google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! },
      },
    }),
  ],
});
```

Swap `memoryAdapter` for a real database adapter (Drizzle, Postgres, etc.) when you go to production.

## 3. Mount on your HTTP framework

`auth.router` returns handlers you mount on the backend you already have — Hono, Express, Bun, FastAPI. Example with Hono:

```ts
import { Hono } from "hono";
import { toHono } from "@superfunctions/http-hono";

const app = new Hono();
app.route("/auth", toHono(auth.router));

export default app;
```

## 4. Use the client SDK

```ts
import { createAuthClient } from "@authfn/client";

const client = createAuthClient({
  baseUrl: "http://localhost:3000/auth",
});

// Sign up with password
await client.password.signUp({ email: "user@example.com", password: "hunter2" });

// Sign in
const session = await client.password.signIn({ email: "user@example.com", password: "hunter2" });

// Read current session
const me = await client.session.get();
```

## Next steps

- [Core Concepts](./core-concepts) — sessions, plugins, regions, observability.
- [Adapters](./adapters) — wire up production database, email, and OAuth providers.
- [API Reference](./api) — full HTTP surface generated from your plugin set.
