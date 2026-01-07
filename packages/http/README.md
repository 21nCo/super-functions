# @superfunctions/http

Framework-agnostic HTTP abstraction layer for building web APIs that work across Express, Hono, Fastify, Next.js, and more.

## Installation

```bash
npm install @superfunctions/http
```

For framework adapters:

```bash
# Express
npm install @superfunctions/http-express

# Hono
npm install @superfunctions/http-hono

# Fastify
npm install @superfunctions/http-fastify

# Next.js
npm install @superfunctions/http-next

# SvelteKit
npm install @superfunctions/http-sveltekit
```

## Quick Start

### Define Your API (Framework Agnostic)

```typescript
import { createRouter } from '@superfunctions/http';

const apiRouter = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/users',
      handler: async () => {
        const users = await db.query('SELECT * FROM users');
        return Response.json(users);
      },
    },
    {
      method: 'GET',
      path: '/users/:id',
      handler: async (req, ctx) => {
        const user = await db.query(
          'SELECT * FROM users WHERE id = ?',
          [ctx.params.id]
        );
        return Response.json(user);
      },
    },
    {
      method: 'POST',
      path: '/users',
      handler: async (req, ctx) => {
        const data = await ctx.json();
        const user = await db.insert('users', data);
        return Response.json(user, { status: 201 });
      },
    },
  ],
});
```

### Use with Express

```typescript
import express from 'express';
import { toExpress } from '@superfunctions/http-express';
import { apiRouter } from './api';

const app = express();
app.use(express.json());
app.use('/api', toExpress(apiRouter));
app.listen(3000);
```

### Use with Hono

```typescript
import { Hono } from 'hono';
import { toHono } from '@superfunctions/http-hono';
import { apiRouter } from './api';

const app = new Hono();
app.route('/api', toHono(apiRouter));

export default app;
```

### Use Directly (Universal Handler)

For Fetch-native frameworks:

```typescript
import { createRouter } from '@superfunctions/http';

const router = createRouter({ routes: [...] });

// Cloudflare Workers
export default {
  fetch: router.handle
};

// Deno
Deno.serve(router.handle);

// Bun
Bun.serve({ fetch: router.handle });
```

## Features

### Middleware

```typescript
const authMiddleware = async (req, ctx, next) => {
  const token = req.headers.get('Authorization');
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  ctx.user = await verifyToken(token);
  return next();
};

const router = createRouter({
  middleware: [authMiddleware],
  routes: [...],
});
```

### Context

```typescript
interface AppContext {
  db: Database;
  user?: User;
}

const router = createRouter<AppContext>({
  context: async (req) => ({
    db: adapter,
    user: await getUser(req),
  }),
  routes: [
    {
      method: 'GET',
      path: '/profile',
      handler: async (req, ctx) => {
        // ctx is typed as AppContext & RouteContext
        return Response.json({ user: ctx.user });
      },
    },
  ],
});
```

### Error Handling

```typescript
import { RouterError, UnauthorizedError } from '@superfunctions/http';

const router = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/protected',
      handler: async () => {
        throw new UnauthorizedError('Invalid token');
      },
    },
  ],
  onError: (error, req) => {
    console.error('Error:', error);
    return Response.json(
      { error: error.message },
      { status: error instanceof RouterError ? error.statusCode : 500 }
    );
  },
});
```

### Base Path

**⚠️ Important: Only use `basePath` for standalone deployments without framework mounting.**

```typescript
// ✅ Good: Standalone deployment (Cloudflare Workers, Vercel Edge)
const router = createRouter({
  basePath: '/api/v1',
  routes: [
    { method: 'GET', path: '/users', handler: ... } // Accessible at /api/v1/users
  ]
});

export default { fetch: router.handle }; // or router.handler

// ❌ Bad: With framework mounting (creates double prefixing)
const router = createRouter({
  basePath: '/v1',  // Don't do this!
  routes: [...]
});
app.use('/api', toExpress(router)); // Would need /api/v1/users

// ✅ Good: With framework mounting (no basePath)
const router = createRouter({
  routes: [
    { method: 'GET', path: '/users', handler: ... }
  ]
});
app.use('/api/v1', toExpress(router)); // Accessible at /api/v1/users
```

**Rule of thumb:**
- **Standalone deployment** → Use `basePath` in router
- **Framework mounting** → Use framework's mounting (e.g., `app.use('/path', ...)`) and omit `basePath`

### CORS

```typescript
import { corsMiddleware } from '@superfunctions/http/middleware';

const router = createRouter({
  middleware: [
    corsMiddleware({
      origin: 'https://example.com',
      methods: ['GET', 'POST'],
      credentials: true,
    }),
  ],
  routes: [...],
});
```

## API Reference

### `createRouter<TContext>(options)`

Creates a framework-agnostic router.

**Options:**
- `routes`: Array of route definitions
- `middleware?`: Global middleware array
- `context?`: Static context or factory function
- `onError?`: Custom error handler
- `basePath?`: Base path prefix for all routes
- `cors?`: CORS configuration

**Returns:** `Router<TContext>`

### Route Definition

```typescript
interface Route<TContext> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';
  path: string;
  handler: RouteHandler<TContext>;
  middleware?: Middleware<TContext>[];
  meta?: Record<string, any>;
}
```

### Route Context

Every handler receives a context with:

```typescript
interface RouteContext {
  params: Record<string, string>;  // Path parameters
  query: URLSearchParams;          // Query string
  url: URL;                        // Full URL
  json: () => Promise<any>;        // Parse JSON body
  formData: () => Promise<FormData>; // Parse form data
  text: () => Promise<string>;     // Get text body
}
```

## Framework Adapters

| Framework | Package | Function |
|-----------|---------|----------|
| Express | `@superfunctions/http-express` | `toExpress()`, `toExpressHandler()` |
| Hono | `@superfunctions/http-hono` | `toHono()` |
| Fastify | `@superfunctions/http-fastify` | `toFastify()` |
| Next.js | `@superfunctions/http-next` | `toNextHandlers()` |
| SvelteKit | `@superfunctions/http-sveltekit` | `toSvelteKitHandler()`, `toSvelteKitHandlers()` |

## License

MIT
