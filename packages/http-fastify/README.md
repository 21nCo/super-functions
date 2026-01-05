# @superfunctions/http-fastify

Fastify adapter for [@superfunctions/http](../http) - Use framework-agnostic routers with Fastify.

## Installation

```bash
npm install @superfunctions/http @superfunctions/http-fastify fastify
```

## Quick Start

```typescript
import Fastify from 'fastify';
import { createRouter } from '@superfunctions/http';
import { toFastify } from '@superfunctions/http-fastify';

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

// Use with Fastify
const fastify = Fastify();
await fastify.register(toFastify(apiRouter), { prefix: '/api' });
await fastify.listen({ port: 3000 });
```

## API

### `toFastify(router)`

Converts a `@superfunctions/http` router to a Fastify plugin.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** `FastifyPluginAsync`

**Example:**
```typescript
import { toFastify } from '@superfunctions/http-fastify';

await fastify.register(toFastify(myRouter), { 
  prefix: '/api' 
});
```


## Usage Examples

### With Plugin Options

```typescript
import Fastify from 'fastify';
import { toFastify } from '@superfunctions/http-fastify';

const fastify = Fastify();

// Register with prefix
await fastify.register(toFastify(apiRouter), { 
  prefix: '/api/v1' 
});

// Routes accessible at: /api/v1/*
await fastify.listen({ port: 3000 });
```

### With Middleware

```typescript
import { createRouter } from '@superfunctions/http';
import { toFastify } from '@superfunctions/http-fastify';

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

await fastify.register(toFastify(router), { prefix: '/api' });
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

await fastify.register(toFastify(router), { prefix: '/api' });
```

### Multiple Routers

```typescript
const usersRouter = createRouter({ routes: [/* user routes */] });
const postsRouter = createRouter({ routes: [/* post routes */] });

await fastify.register(toFastify(usersRouter), { prefix: '/api/users' });
await fastify.register(toFastify(postsRouter), { prefix: '/api/posts' });
```

### With Fastify Decorators

You can combine with other Fastify plugins:

```typescript
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import { toFastify } from '@superfunctions/http-fastify';

const fastify = Fastify();

// Register CORS plugin
await fastify.register(fastifyCors, {
  origin: 'https://example.com'
});

// Register your router
await fastify.register(toFastify(apiRouter), { prefix: '/api' });

await fastify.listen({ port: 3000 });
```

## Important Notes

### Plugin Registration

The adapter returns a Fastify plugin that must be registered with `await fastify.register()`:

```typescript
// ✅ Correct - await registration
await fastify.register(toFastify(router));

// ❌ Incorrect - missing await
fastify.register(toFastify(router));
```

### Prefix Handling

The adapter automatically handles the prefix from plugin options:

```typescript
const router = createRouter({
  routes: [
    { method: 'GET', path: '/hello', handler: () => Response.json({ msg: 'hi' }) }
  ]
});

// Route accessible at: /api/hello
await fastify.register(toFastify(router), { prefix: '/api' });
```

### JSON Serialization

Fastify automatically serializes JSON responses. The adapter handles this by:
- Parsing JSON from Web Response
- Sending parsed objects to Fastify
- Letting Fastify handle serialization

### Body Parsing

Fastify automatically parses JSON and form data. The adapter accesses the parsed body via `request.body`.

### Testing

Use Fastify's built-in `inject` method for testing:

```typescript
const response = await fastify.inject({
  method: 'GET',
  url: '/api/hello'
});

expect(response.statusCode).toBe(200);
expect(response.json()).toEqual({ message: 'Hello' });
```

## TypeScript

Full TypeScript support with proper types:

```typescript
import type { Router } from '@superfunctions/http';
import type { FastifyPluginAsync } from 'fastify';

const myRouter: Router = createRouter({ routes: [...] });
const plugin: FastifyPluginAsync = toFastify(myRouter);

await fastify.register(plugin, { prefix: '/api' });
```

## Performance

The adapter is designed for minimal overhead:
- Uses catch-all route to delegate to the router
- Minimal request/response translation
- Leverages Fastify's fast JSON serialization

## Compatibility

- Fastify 4.x ✅
- Fastify 5.x ✅

## License

MIT
