---
title: Node.js (Hono / Express)
description: Stand up an authfn server on Node with Hono or Express, talk to it from the typed client, and switch from the in-memory adapter to Postgres when you're ready.
---

# Node.js quickstart

## 1. Install

```bash
npm install authfn @authfn/password @authfn/email-otp @authfn/client
npm install @superfunctions/db @superfunctions/http-hono hono
# or for Express
npm install authfn @authfn/password @authfn/email-otp @authfn/client
npm install @superfunctions/db @superfunctions/http-express express
```

## 2. Declare the app and create the server

```ts
// auth.ts
import { memoryAdapter } from "@superfunctions/db/testing";
import { authfn, authFnPlugins } from "authfn";
import { authFnPasswordPlugin } from "@authfn/password";
import { authFnEmailOtpPlugin } from "@authfn/email-otp";

export const authApp = authfn({
  namespace: "authfn",
  openApi: { title: "AuthFn API", version: "1.0.0" },
  plugins: authFnPlugins(
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin(),
  ),
});

export const auth = authApp.createServer({
  database: memoryAdapter({ debug: false }),
  pluginRuntime: {
    emailOtp: {
      delivery: {
        async send(input) {
          console.log(`[OTP] ${input.purpose} → ${input.email}: ${input.code}`);
          return { sent: true };
        },
      },
    },
  },
});
```

`authApp` is safe to import from schema tooling. `auth` is the running server: mount `auth.router` and call `auth.provider.authenticate(request)`.

## 3. Mount

### Hono

```ts
// server.ts
import { Hono } from "hono";
import { toHono } from "@superfunctions/http-hono";
import { auth } from "./auth.js";

const app = new Hono();
app.route("/auth", toHono(auth.router));
app.get("/openapi.json", (c) => c.json(auth.openApi?.() ?? {}));

export default { port: 3000, fetch: app.fetch };
```

### Express

```ts
// server.ts
import express from "express";
import { toExpress } from "@superfunctions/http-express";
import { auth } from "./auth.js";

const app = express();
app.use("/auth", toExpress(auth.router));
app.get("/openapi.json", (_req, res) => res.json(auth.openApi?.() ?? {}));
app.listen(3000);
```

## 4. Call it from the client

```ts
// client.ts
import { createAuthFnClient } from "@authfn/client";

const client = createAuthFnClient({ baseUrl: "http://localhost:3000/auth" });

const session = await client.signUpWithPassword({
  email: "ada@example.com",
  password: "correct horse battery staple",
});
const me = await client.getSession();
```

## 5. Move to Postgres

Swap `memoryAdapter` for the Drizzle adapter once you're ready for a real database:

```ts
import { drizzleAdapter } from "@superfunctions/db/adapters/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const db = drizzle(new Pool({ connectionString: process.env.DATABASE_URL }));

const auth = authApp.createServer({
  database: drizzleAdapter(db),
  pluginRuntime: {
    emailOtp: { delivery: yourDelivery },
  },
});
```

Generate the migrations from the plugin set you've enabled:

```bash
npx @superfunctions/cli generate
```

`authApp.getSchema()` does not need a database connection.

## Next steps

- [Frameworks → Hono](../frameworks/hono) and [Frameworks → Express](../frameworks/express) for deeper integration patterns (CSRF on subdomains, custom error mapping, observability adapters).
- [Adapters → Database](../adapters/database) for Drizzle, raw Postgres, SQLite, and custom adapters.
- [Plugins](../plugins) to add social OAuth, API keys, 2FA, multi-region, and native handoff.
