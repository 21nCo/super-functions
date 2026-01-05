# @superfunctions/http-sveltekit

SvelteKit adapter for [@superfunctions/http](../http) - Use framework-agnostic routers with SvelteKit.

## Installation

```bash
npm install @superfunctions/http @superfunctions/http-sveltekit @sveltejs/kit
```

## Quick Start

Create `src/routes/api/+server.ts`:

```typescript
import { createRouter } from '@superfunctions/http';
import { toSvelteKitHandler } from '@superfunctions/http-sveltekit';

const router = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/api',
      handler: async () => Response.json({ ok: true }),
    },
    {
      method: 'GET',
      path: '/api/users/:id',
      handler: async (_req, ctx) => Response.json({ id: ctx.params.id }),
    },
  ],
});

// Export individual handlers
export const GET = toSvelteKitHandler(router);
export const POST = toSvelteKitHandler(router);
```

## API

### `toSvelteKitHandler(router)`

Converts a `@superfunctions/http` router to a SvelteKit RequestHandler.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** `RequestHandler`

**Example:**
```typescript
import { toSvelteKitHandler } from '@superfunctions/http-sveltekit';

export const GET = toSvelteKitHandler(myRouter);
export const POST = toSvelteKitHandler(myRouter);
```

### `toSvelteKitHandlers(router)`

Creates all HTTP method handlers at once.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** Object with `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD` handlers

**Example:**
```typescript
import { toSvelteKitHandlers } from '@superfunctions/http-sveltekit';

export const { GET, POST, PUT, PATCH, DELETE } = toSvelteKitHandlers(myRouter);
```

## Usage Examples

### With Middleware

```typescript
import { createRouter } from '@superfunctions/http';
import { toSvelteKitHandler } from '@superfunctions/http-sveltekit';

const router = createRouter({
  middleware: [
    async (req, ctx, next) => {
      // Auth middleware
      const token = req.headers.get('Authorization');
      if (!token) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return next();
    },
  ],
  routes: [
    {
      method: 'GET',
      path: '/api/protected',
      handler: async () => Response.json({ data: 'secret' }),
    },
  ],
});

export const GET = toSvelteKitHandler(router);
```

### With Custom Context

```typescript
interface AppContext {
  db: Database;
}

const router = createRouter<AppContext>({
  context: { db: myDatabase },
  routes: [
    {
      method: 'GET',
      path: '/api/users',
      handler: async (req, ctx) => {
        const users = await ctx.db.findMany({ model: 'users' });
        return Response.json(users);
      },
    },
  ],
});

export const GET = toSvelteKitHandler(router);
```

### Dynamic Routes

For dynamic routes, create files with SvelteKit's naming convention:

`src/routes/api/users/[id]/+server.ts`:
```typescript
import { createRouter } from '@superfunctions/http';
import { toSvelteKitHandler } from '@superfunctions/http-sveltekit';

const router = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/api/users/:id',
      handler: async (_req, ctx) => {
        return Response.json({ id: ctx.params.id });
      },
    },
  ],
});

export const GET = toSvelteKitHandler(router);
```

### Multiple Routes

`src/routes/api/[...path]/+server.ts` (catch-all):
```typescript
import { createRouter } from '@superfunctions/http';
import { toSvelteKitHandlers } from '@superfunctions/http-sveltekit';

const router = createRouter({
  basePath: '/api',
  routes: [
    { method: 'GET', path: '/users', handler: () => Response.json([]) },
    { method: 'GET', path: '/posts', handler: () => Response.json([]) },
  ],
});

export const { GET, POST, PUT, PATCH, DELETE } = toSvelteKitHandlers(router);
```

## Important Notes

### Web Standards

SvelteKit uses Web Standard `Request` and `Response`, making this adapter very lightweight.

### Route Paths

Routes are matched against the full URL path:

```typescript
const router = createRouter({
  routes: [
    { method: 'GET', path: '/api/hello', handler: () => Response.json({ msg: 'hi' }) }
  ]
});

// File: src/routes/api/hello/+server.ts
export const GET = toSvelteKitHandler(router);
```

If using a catch-all route, use `basePath`:

```typescript
const router = createRouter({
  basePath: '/api',
  routes: [
    { method: 'GET', path: '/hello', handler: () => Response.json({ msg: 'hi' }) }
  ]
});

// File: src/routes/api/[...path]/+server.ts
export const { GET } = toSvelteKitHandlers(router);
```

### SvelteKit Context

The adapter passes the raw `event.request` to your router. For SvelteKit-specific features (cookies, locals, etc.), access them via the route handler or middleware:

```typescript
// If you need SvelteKit context, create a wrapper
export const GET = async (event: RequestEvent) => {
  // Access SvelteKit-specific features
  const userId = event.locals.userId;
  
  // Then call the router
  const response = await router.handle(event.request);
  return response;
};
```

## TypeScript

Full TypeScript support:

```typescript
import type { Router } from '@superfunctions/http';
import type { RequestHandler } from '@sveltejs/kit';

const myRouter: Router = createRouter({ routes: [...] });
const handler: RequestHandler = toSvelteKitHandler(myRouter);
```

## Edge Runtime Support

Works seamlessly with SvelteKit's edge runtime:

```typescript
// +server.ts
export const config = {
  runtime: 'edge'
};

export const { GET, POST } = toSvelteKitHandlers(router);
```

## Compatibility

- SvelteKit 1.x ✅
- SvelteKit 2.x ✅

## License

MIT
