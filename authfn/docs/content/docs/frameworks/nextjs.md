---
title: Next.js (App Router)
description: Mount authfn as a Route Handler and read sessions from RSC, Server Actions, and middleware.
---

# Next.js

```bash
npm install @superfunctions/http-next
```

## Catch-all Route Handler

```ts
// app/auth/[...path]/route.ts
import { toNext } from '@superfunctions/http-next';
import { auth } from '../_runtime';

const handler = toNext(auth.router);
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
```

## Reading the session in Server Components

```tsx
// app/dashboard/page.tsx
import { headers } from 'next/headers';
import { auth } from '../auth/_runtime';
import { redirect } from 'next/navigation';

export default async function Dashboard() {
  const reqHeaders = await headers();
  const fakeRequest = new Request('http://localhost', { headers: reqHeaders });
  const session = await auth.provider.authenticate(fakeRequest);
  if (!session) redirect('/sign-in');
  return <p>Hello, {session.primaryEmail}</p>;
}
```

`@superfunctions/http-next` exposes a helper for the fake-request pattern:

```ts
import { toNextSession } from '@superfunctions/http-next';
const session = await toNextSession(auth, await headers());
```

## Server Actions

```tsx
'use server';
import { headers } from 'next/headers';
import { auth } from '../auth/_runtime';

export async function deleteMyAccount() {
  const reqHeaders = await headers();
  const request = new Request(new URL('/auth/account', 'http://localhost'), {
    method: 'DELETE',
    headers: reqHeaders,
  });
  const response = await auth.router.fetch(request);
  if (!response.ok) throw new Error('delete failed');
}
```

## Middleware-based gating

```ts
// middleware.ts
import { NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname.startsWith('/dashboard')) {
    const cookies = request.cookies.toString();
    const session = await auth.provider.authenticate(new Request(url, { headers: { cookie: cookies } }));
    if (!session) return NextResponse.redirect(new URL('/sign-in', url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/dashboard/:path*'] };
```

## Edge runtime

```ts
export const runtime = 'edge';
```

works as long as your DB adapter is edge-compatible.

## Related

- [Quickstart → Next.js](../quickstart/nextjs)
