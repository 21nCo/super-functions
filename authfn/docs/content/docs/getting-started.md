---
title: Getting Started
description: Install authfn, configure a server with your first plugins, mount it on Hono, and sign in a user from a typed client — in about ten minutes.
---

# Getting Started

This guide walks you through a minimal end-to-end authfn setup. By the end, you'll have a server that can sign users up with email and password, return cookie sessions, and a typed client calling it.

What you'll do:

1. Install `@authfn/core` and `@authfn/client`.
2. Create an `AuthFn` runtime with the plugins you want enabled.
3. Mount it on an HTTP framework (we'll use Hono — recipes for Express, Bun, SvelteKit, Next.js, FastAPI, Flask are in [Frameworks](./frameworks)).
4. Call it from the typed client.

We'll start with an in-memory database so you can run the example with zero infrastructure. The same code switches to Drizzle, Postgres, or any other supported adapter by changing one line — see [Adapters → Database](./adapters/database).

## Prerequisites

- **Node 18+** (or Bun 1.1+, Deno 1.40+).
- Optional: a Postgres or SQLite database for the production adapter walkthrough at the end.
- Optional: a mail provider (Resend, Postmark, SendGrid, AWS SES, …) if you want OTP email to leave your machine.

## 1. Install

```bash
npm install @authfn/core @authfn/client
```

For SvelteKit apps you'll also want the Svelte bindings:

```bash
npm install @authfn/svelte
```

If you'll be talking to authfn from Python or Swift later, see [Python SDK](./sdk/python) and [Swift SDK](./sdk/swift). The on-the-wire contract is identical across SDKs, so picking one for a quickstart doesn't lock you in.

## 2. Create the server runtime

`createAuthFn()` composes a database adapter, your chosen plugins, optional hooks, and an observability sink into a single runtime. **Plugins are opt-in** — only the auth methods you enable show up as routes, schema tables, and OpenAPI operations.

Create `auth.ts`:

```ts
import { memoryAdapter } from "@superfunctions/db/adapters/memory";
import {
  authFnEmailOtpPlugin,
  authFnPasswordPlugin,
  authFnSocialOAuthPlugin,
  createAuthFn,
} from "@authfn/core";

export const auth = createAuthFn({
  database: memoryAdapter({ debug: false }),
  namespace: "authfn",
  openApi: {
    title: "AuthFn API",
    version: "1.0.0",
  },
  observability: {
    emit(event) {
      console.log(event.type, event.requestId, event.metadata ?? {});
    },
  },
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({
      delivery: {
        async send(input) {
          // For local development, log the OTP to the console.
          // In production, hand off to your mail provider here.
          console.log(`[OTP] ${input.purpose} → ${input.email}: ${input.code}`);
          return { sent: true };
        },
      },
    }),
    authFnSocialOAuthPlugin({
      providers: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          allowlistedReturnTo: ["http://localhost:3000/post-auth"],
        },
      },
    }),
  ],
});
```

A few things worth noting:

- **`namespace`** prefixes every authfn-managed table (e.g. `authfn_users`, `authfn_sessions`). Pick a value that's stable for your app.
- **`openApi`** enables `auth.openApi()` — it returns an OpenAPI 3.1 document you can serve at any path.
- **`observability.emit`** is your hook into every meaningful action: sign-ups, session issuance, OAuth callbacks, region lookups, plugin failures. Pipe it into your logging, metrics, or audit pipeline.
- **`memoryAdapter`** is for local development and tests only. Swap it for `drizzleAdapter`, `postgresAdapter`, or your own when you go to production. See [Adapters → Database](./adapters/database).

## 3. Mount on your HTTP framework

`auth.router` is a framework-agnostic router that you mount through one of the `@superfunctions/http-*` adapters. Here's the Hono version:

```ts
// server.ts
import { Hono } from "hono";
import { toHono } from "@superfunctions/http-hono";
import { auth } from "./auth.js";

const app = new Hono();

app.route("/auth", toHono(auth.router));

app.get("/openapi.json", (c) => c.json(auth.openApi?.() ?? {}));

export default {
  port: 3000,
  fetch: app.fetch,
};
```

Run it with:

```bash
node --watch --experimental-strip-types server.ts
# or
bun run server.ts
```

You should see authfn's lifecycle events print to the console as you call it.

For other frameworks, see [Frameworks](./frameworks):

- [Hono](./frameworks/hono) (above)
- [Express](./frameworks/express)
- [Bun](./frameworks/bun)
- [SvelteKit](./frameworks/sveltekit)
- [Next.js (App Router)](./frameworks/nextjs)
- [FastAPI](./frameworks/fastapi)
- [Flask](./frameworks/flask)
- [Starlette](./frameworks/starlette)

## 4. Call it from the typed client

```ts
// client.ts
import { createAuthFnClient } from "@authfn/client";

const client = createAuthFnClient({
  baseUrl: "http://localhost:3000/auth",
});

// 1. Sign up with email and password.
const session = await client.signUpWithPassword({
  email: "ada@example.com",
  password: "correct horse battery staple",
});
console.log("Signed up; session id:", session.session.id);

// 2. Read the current session — uses the cookie set above.
const me = await client.getSession();
console.log("Current user:", me.session?.primaryEmail);

// 3. List all sessions for this user.
const sessions = await client.listSessions();
console.log(`User has ${sessions.sessions.length} active sessions`);

// 4. Sign out.
await client.signOut();
```

By default the client uses cookie credentials (`credentials: "include"` plus CSRF double-submit on mutating routes). For mobile or CLI clients that can't store cookies, use bearer-token mode — see [SDKs → Client → Token mode](./sdk/client/token-mode).

## 5. Add the plugins you actually need

The runtime above already supports password, email OTP, and Google sign-in. Adding API keys, 2FA, multi-region routing, or native handoff is a matter of including more plugins:

```ts
import {
  authFnApiKeyPlugin,
  authFnMultiRegionPlugin,
  authFnNativeHandoffPlugin,
  authFnTwoFactorPlugin,
} from "@authfn/core";

createAuthFn({
  // …
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({ delivery }),
    authFnSocialOAuthPlugin({ providers: { google, apple, github } }),
    authFnApiKeyPlugin(),
    authFnTwoFactorPlugin(),
    authFnMultiRegionPlugin({ regions: [/* … */] }),
    authFnNativeHandoffPlugin(),
  ],
});
```

Each plugin contributes its own routes, schema, OpenAPI surface, and observability events. Removing one removes its surface entirely. See [Plugins](./plugins) for end-to-end docs on each.

## 6. Switch from in-memory to a real database

`memoryAdapter` exists for tests and quickstarts. To move to a real database, swap the adapter:

```ts
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

createAuthFn({
  database: drizzleAdapter(db),
  namespace: "authfn",
  // … plugins
});
```

Generate the schema for your enabled plugins with the Superfunctions CLI:

```bash
npx @superfunctions/cli generate
```

See [Adapters → Database → Drizzle](./adapters/database/drizzle), [Postgres](./adapters/database/postgres), or [SQLite](./adapters/database/sqlite) for full instructions.

## Next steps

- [Core Concepts](./core-concepts) — read this if you'll be operating authfn in production. It covers sessions, plugins, regions, observability, hooks, the runtime resolver, and the canonical envelope/error model.
- [Plugins](./plugins) — full reference for every bundled plugin: configuration, routes, events, errors.
- [Recipes](./recipes) — copy-pasteable solutions for common flows: account deletion, email verification, magic link, adding 2FA, multi-region deployment, native mobile handoff.
- [API Reference](./api) — interactive OpenAPI viewer.
- [AI resources](./ai-resources) — `llms.txt`, MCP, and Skills for getting authfn answers from Claude / Cursor / Codex.
