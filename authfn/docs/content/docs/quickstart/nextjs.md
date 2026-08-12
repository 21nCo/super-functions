---
title: Next.js (App Router)
description: Mount authfn as a Next.js Route Handler and read sessions from server components and Server Actions.
---

# Next.js quickstart

authfn ships a Next.js adapter that wraps `auth.router` as App Router Route Handlers. The runtime itself is fully edge-compatible if you pick edge-compatible database and cache adapters.

## 1. Install

```bash
npm install @authfn/core @authfn/client @superfunctions/http-next
```

## 2. Create the runtime

```ts
// app/auth/_runtime.ts
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
  openApi: { title: "AuthFn API", version: "1.0.0" },
  plugins: [
    authFnPasswordPlugin(),
    authFnEmailOtpPlugin({
      delivery: {
        async send({ email, code, purpose }) {
          console.log(`[OTP] ${purpose} → ${email}: ${code}`);
          return { sent: true };
        },
      },
    }),
    authFnSocialOAuthPlugin({
      providers: {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          allowlistedReturnTo: ["/post-auth"],
        },
      },
    }),
  ],
});
```

## 3. Mount the catch-all Route Handler

```ts
// app/auth/[...path]/route.ts
import { auth } from "../_runtime";
import { toNext } from "@superfunctions/http-next";

const handler = toNext(auth.router);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
```

## 4. Read the session in Server Components

```tsx
// app/dashboard/page.tsx
import { auth } from "../auth/_runtime";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function Dashboard() {
  const reqHeaders = await headers();
  const fakeRequest = new Request("http://localhost", { headers: reqHeaders });
  const session = await auth.provider.authenticate(fakeRequest);

  if (!session) {
    redirect("/sign-in");
  }

  return <p>Hello, {session.primaryEmail}</p>;
}
```

> The fake-request pattern is the canonical way to authenticate a Next.js Server Component with the cookie-based authfn session. The `@superfunctions/http-next` package exposes a helper for this — see [Frameworks → Next.js](../frameworks/nextjs).

## 5. Use Server Actions

```tsx
// app/account/actions.ts
"use server";
import { auth } from "../auth/_runtime";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function deleteMyAccount() {
  const reqHeaders = await import("next/headers").then((m) => m.headers());
  const fakeRequest = new Request("http://localhost/auth/account", {
    method: "DELETE",
    headers: reqHeaders,
  });

  const response = await auth.router.fetch(fakeRequest);
  if (!response.ok) throw new Error("delete failed");

  revalidatePath("/");
  redirect("/");
}
```

## 6. Edge runtime

To run authfn in the edge runtime, pick an edge-compatible adapter for the database (Cloudflare D1, Hyperdrive + Postgres, or your own) and add:

```ts
export const runtime = "edge";
```

to your route file. Note that `memoryAdapter` does not span isolates and must not be used outside development.

## Next steps

- [Frameworks → Next.js](../frameworks/nextjs) for production-grade patterns: cookie domain on subdomains, RSC streaming, middleware-based gating.
- [Adapters → Database](../adapters/database) for production database adapters.
