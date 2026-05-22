---
title: Hono
description: Mount authfn on Hono with @superfunctions/http-hono.
---

# Hono

Hono is the recommended framework for new authfn deployments — it's WHATWG-native, runs on every JS runtime, and the adapter is one line.

```bash
npm install hono @superfunctions/http-hono
```

```ts
import { Hono } from 'hono';
import { toHono } from '@superfunctions/http-hono';
import { auth } from './auth.js';

const app = new Hono();
app.route('/auth', toHono(auth.router));
app.get('/openapi.json', (c) => c.json(auth.openApi?.() ?? {}));

export default { port: 3000, fetch: app.fetch };
```

## CORS

Hono's `cors` middleware works as expected. Set credentials and origin precisely:

```ts
import { cors } from 'hono/cors';

app.use('/auth/*', cors({
  origin: ['https://app.example.com'],
  credentials: true,
  allowHeaders: ['Content-Type', 'X-CSRF-Token'],
}));
```

## Reading the session

Use `auth.provider.authenticate(request)` directly, or build a Hono middleware:

```ts
const requireAuth = createMiddleware<{ Variables: { session: AuthFnSession } }>(async (c, next) => {
  const session = await auth.provider.authenticate(c.req.raw);
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('session', session);
  await next();
});

app.get('/me', requireAuth, (c) => c.json({ user: c.get('session').subject }));
```

## Workers / Edge

Hono runs on Cloudflare Workers natively. Mount authfn the same way; pick an edge-compatible database adapter (D1 via Drizzle, Hyperdrive + Postgres, etc.). See [Adapters → Database → Drizzle](../adapters/database/drizzle).
