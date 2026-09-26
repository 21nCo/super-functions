---
title: Bun
description: Run authfn under Bun's native HTTP server with zero compatibility shims.
---

# Bun quickstart

authfn's router is built on the WHATWG `Request`/`Response` standard, so Bun is a first-class runtime. You don't need a framework adapter at all — `auth.router.handle` _is_ a `(Request) => Promise<Response>` handler.

## 1. Install

```bash
bun add authfn @authfn/password @authfn/email-otp @authfn/client @superfunctions/db
```

## 2. Declare the app and create the server

```ts
// auth.ts
import { memoryAdapter } from "@superfunctions/db/testing";
import { authfn, authFnPlugins, type AuthFnDeliveryProvider } from "authfn";
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

const delivery: AuthFnDeliveryProvider = {
  async send(input) {
    console.log(`[OTP] ${input.purpose} → ${input.email}: ${input.code}`);
    return { sent: true };
  },
};

export const auth = authApp.createServer({
  database: memoryAdapter({ debug: false }),
  pluginRuntime: {
    password: { otp: { delivery } },
    emailOtp: { delivery },
  },
});
```

## 3. Serve it

```ts
// server.ts
import { auth } from "./auth.ts";

Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/openapi.json") {
      return Response.json(auth.openApi?.() ?? {});
    }

    if (url.pathname.startsWith("/auth")) {
      // The authfn router already includes its /auth basePath.
      return auth.router.handle(request);
    }

    return new Response("not found", { status: 404 });
  },
});
```

## 4. Hot reload

Bun's `--hot` flag works as expected because the `auth` instance is module-scoped. For more aggressive reloads, restart the runtime instead — authfn keeps no in-process state besides what your database adapter holds.

```bash
bun run --hot server.ts
```

## 5. Cloudflare Workers / edge

The same pattern works on Cloudflare Workers (or any Workers-compatible runtime), with two caveats:

- Use a Workers-compatible database adapter (Cloudflare D1, Hyperdrive + Postgres, or a Cloudflare KV store as the cache layer for plugins that take shared stores).
- The `crypto` and `subtle` primitives authfn uses are part of the Workers runtime; no polyfill is needed.

## Next steps

- [SDKs → Client → Token mode](../sdk/client#bearer-mode) for non-cookie clients (CLI, mobile, server-to-server).
- [Adapters → Database](../adapters/database) — Bun-friendly Postgres and SQLite adapters.
- [Frameworks → Bun](../frameworks/bun) for a deeper integration pattern.
