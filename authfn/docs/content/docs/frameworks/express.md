---
title: Express
description: Mount authfn on Express with @superfunctions/http-express.
---

# Express

```bash
npm install express @superfunctions/http-express
```

```ts
import express from 'express';
import { toExpress } from '@superfunctions/http-express';
import { auth } from './auth.js';

const app = express();
app.use('/auth', toExpress(auth.router));
app.get('/openapi.json', (_req, res) => res.json(auth.openApi?.() ?? {}));
app.listen(3000);
```

The `toExpress` adapter:

- Constructs a WHATWG `Request` from `req.originalUrl`, `req.method`, `req.headers`, and the raw body buffer.
- Pipes the response back through `res.status` / `res.setHeader` / `res.end`.
- Honors streaming via `res.write` / `res.end`.

## CORS

```ts
import cors from 'cors';

app.use('/auth', cors({
  origin: ['https://app.example.com'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
}));
```

## Body parsers

Don't add `express.json()` *before* `toExpress`. The adapter reads the raw body itself; running `express.json()` first will leave the body stream consumed. Either:

- Mount the body parser only on non-authfn paths (`app.use('/api', express.json())`), or
- Pass `{ parseBody: 'json' }` to `toExpress` if you want the adapter to parse for you.

## Reading the session

```ts
app.get('/me', async (req, res) => {
  const request = toExpress.toFetchRequest(req);
  const session = await auth.provider.authenticate(request);
  if (!session) return res.sendStatus(401);
  res.json({ user: session.subject });
});
```

## Trust proxy

If you're behind a reverse proxy (Nginx, ELB), set `app.set('trust proxy', 1)` so `req.protocol` is correct and your runtime resolver sees the right base URL.
