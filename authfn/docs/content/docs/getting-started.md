---
title: Getting Started
description: Declare an authfn app, create its server runtime, mount it on Hono, and sign in from the typed client.
---

# Getting Started

authfn separates the side-effect-free app declaration from runtime dependencies. `authfn()` declares plugins, schema, routes, and OpenAPI metadata. `.createServer()` supplies the database, delivery providers, shared stores, hooks, and observability used by a running server.

## 1. Install

This example enables password, email OTP, and social OAuth:

```bash
npm install authfn @authfn/password @authfn/email-otp @authfn/social-oauth @authfn/client
npm install @superfunctions/db @superfunctions/http-hono hono
```

Install only the plugin packages you use. API keys, two-factor authentication, multi-region routing, and native handoff live in their own `@authfn/*` packages too.

## 2. Declare the app

```ts
// auth-app.ts
import { authfn, authFnPlugins } from "authfn";
import { authFnPasswordPlugin } from "@authfn/password";
import { authFnEmailOtpPlugin } from "@authfn/email-otp";
import { authFnSocialOAuthPlugin } from "@authfn/social-oauth";

export const authApp = authfn({
  namespace: "authfn",
  openApi: { title: "AuthFn API", version: "1.0.0" },
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
    authFnSocialOAuthPlugin(),
  ),
});
```

The app declaration is safe to import from schema generation and build tooling because it does not connect to a database or provider.

## 3. Create the server runtime

```ts
// auth-server.ts
import { memoryAdapter } from "@superfunctions/db/testing";
import { authApp } from "./auth-app.js";

export const auth = authApp.createServer({
  database: memoryAdapter({ debug: false }),
  pluginRuntime: {
    emailOtp: {
      delivery: {
        async send(input) {
          console.log(`[OTP] ${input.email}: ${input.code}`);
          return { sent: true };
        },
      },
    },
    socialOAuth: {
      providers: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          allowlistedReturnTo: ["http://localhost:3000/post-auth"],
        },
      },
    },
  },
  observability: {
    emit(event) {
      console.log(event.type, event.requestId);
    },
  },
});
```

`emailOtp` and `socialOAuth` are required here because those plugins declare runtime dependencies. Password-only policy such as a compromised-password checker stays in `authFnPasswordPlugin({...})`; password reset delivery can be supplied as `pluginRuntime.password.otp`.

The memory adapter is for local development and tests. Swap it for a production `@superfunctions/db` adapter before deployment.

## 4. Mount the router

```ts
import { Hono } from "hono";
import { toHono } from "@superfunctions/http-hono";
import { auth } from "./auth-server.js";

const app = new Hono();
app.route("/auth", toHono(auth.router));

export default app;
```

The same framework-neutral router works with the Express, Fastify, Next.js, SvelteKit, and other `@superfunctions/http-*` adapters.

## 5. Call it from the typed client

```ts
import { createAuthFnClient } from "@authfn/client";

const client = createAuthFnClient({
  baseUrl: "http://localhost:3000/auth",
});

const signUp = await client.signUpWithPassword({
  email: "ada@example.com",
  password: "correct horse battery staple",
});
if (!signUp.ok) throw new Error(signUp.error.message);

const current = await client.getSession();
if (!current.ok) throw new Error(current.error.message);
console.log(current.data.session?.primaryEmail);

const signOut = await client.signOut();
if (!signOut.ok) throw new Error(signOut.error.message);
```

Client methods return the canonical success/error envelope instead of throwing for an auth-domain failure. Transport failures still reject the promise.

## Next steps

- [Core package](./sdk/core) — declaration and runtime configuration reference.
- [Plugins](./plugins) — plugin packages, schema options, and runtime dependencies.
- [Adapters](./adapters) — production databases and delivery providers.
- [Frameworks](./frameworks) — mount `auth.router` in your server stack.
- [Client SDK](./sdk/client) — cookies, bearer tokens, regional clients, and errors.
