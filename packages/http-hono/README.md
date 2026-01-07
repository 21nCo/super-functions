# @superfunctions/http-hono

Hono adapter for [@superfunctions/http](../http) - Use framework-agnostic routers with Hono.

## Installation

```bash
npm install @superfunctions/http @superfunctions/http-hono hono
```

## Quick Start

```typescript
import { Hono } from 'hono';
import { createRouter } from '@superfunctions/http';
import { toHono } from '@superfunctions/http-hono';

// Define your router (framework-agnostic)
const apiRouter = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/users/:id',
      handler: async (req, ctx) => {
        return Response.json({ id: ctx.params.id });
      },
    },
  ],
});

// Use with Hono
const app = new Hono();
app.route('/api', toHono(apiRouter));

export default app;
```

## API

### `toHono(router)`

Converts a `@superfunctions/http` router to a Hono instance.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** `Hono`

**Example:**
```typescript
import { toHono } from '@superfunctions/http-hono';

const honoApp = toHono(myRouter);
app.route('/api', honoApp);
```


## Usage Examples

### With Middleware

```typescript
import { createRouter } from '@superfunctions/http';
import { toHono } from '@superfunctions/http-hono';

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
      path: '/protected',
      handler: async () => Response.json({ data: 'secret' }),
    },
  ],
});

const app = new Hono();
app.route('/api', toHono(router));
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
      path: '/users',
      handler: async (req, ctx) => {
        const users = await ctx.db.findMany({ model: 'users' });
        return Response.json(users);
      },
    },
  ],
});

const app = new Hono();
app.route('/api', toHono(router));
```

### Multiple Routers

```typescript
const usersRouter = createRouter({ routes: [/* user routes */] });
const postsRouter = createRouter({ routes: [/* post routes */] });

const app = new Hono();
app.route('/api/users', toHono(usersRouter));
app.route('/api/posts', toHono(postsRouter));
```

### Edge Runtime Example

```typescript
// Cloudflare Workers
import { createRouter } from '@superfunctions/http';
import { toHono } from '@superfunctions/http-hono';

const router = createRouter({
  routes: [
    { method: 'GET', path: '/', handler: async () => Response.json({ ok: true }) }
  ]
});

const app = new Hono();
app.route('/', toHono(router));

export default app;
```

## Alternative: Universal Handler

Since Hono uses Web Standards natively, you can also use the router directly without the adapter:

```typescript
import { Hono } from 'hono';
import { createRouter } from '@superfunctions/http';

const router = createRouter({
  routes: [/* routes */]
});

const app = new Hono();
app.all('/*', (c) => router.handler(c.req.raw));
```

**When to use the adapter:**
- ✅ Full per-route registration
- ✅ Framework-native patterns
- ✅ Better integration with Hono middleware

**When to use universal handler:**
- ✅ Simpler setup
- ✅ Single catch-all route
- ✅ Minimal code

## Important Notes

### Web Standards

Hono uses Web Standard `Request` and `Response` natively, making this adapter very lightweight with near-zero overhead.

### Route Paths

Routes are registered relative to the mount point:

```typescript
const router = createRouter({
  routes: [
    { method: 'GET', path: '/hello', handler: () => Response.json({ msg: 'hi' }) }
  ]
});

// Route accessible at: /api/hello
app.route('/api', toHono(router));
```

### HEAD Requests

Hono doesn't have a built-in `head` method, so HEAD requests in your router are automatically skipped. Most frameworks handle HEAD automatically from GET routes.

## TypeScript

Full TypeScript support with proper types:

```typescript
import type { Router } from '@superfunctions/http';
import type { Hono } from 'hono';

const myRouter: Router = createRouter({ routes: [...] });
const honoApp: Hono = toHono(myRouter);
```

## Edge Runtime Support

Works seamlessly with:
- ✅ Cloudflare Workers
- ✅ Deno Deploy
- ✅ Vercel Edge Functions
- ✅ Bun

## Compatibility

- Hono 4.x ✅

## License

MIT
