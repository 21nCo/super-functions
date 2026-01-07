# @superfunctions/http-express

Express adapter for [@superfunctions/http](../http) - Use framework-agnostic routers with Express.

## Installation

```bash
npm install @superfunctions/http @superfunctions/http-express express
```

## Quick Start

```typescript
import express from 'express';
import { createRouter } from '@superfunctions/http';
import { toExpress } from '@superfunctions/http-express';

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

// Use with Express
const app = express();
app.use(express.json()); // Important: Add body parser
app.use('/api', toExpress(apiRouter));
app.listen(3000);
```

## API

### `toExpress(router)`

Converts a `@superfunctions/http` router to an Express RequestHandler.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** `express.RequestHandler`

**Example:**
```typescript
import { toExpress } from '@superfunctions/http-express';

app.use('/api', toExpress(myRouter));
```

## Usage Examples

### With Middleware

```typescript
import { createRouter } from '@superfunctions/http';
import { toExpress } from '@superfunctions/http-express';

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

app.use('/api', toExpress(router));
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

app.use('/api', toExpress(router));
```

### Multiple Routers

```typescript
const usersRouter = createRouter({ routes: [/* user routes */] });
const postsRouter = createRouter({ routes: [/* post routes */] });

app.use('/api/users', toExpress(usersRouter));
app.use('/api/posts', toExpress(postsRouter));
```

## Important Notes

### Body Parsing

You must add Express body parsing middleware before using the adapter:

```typescript
app.use(express.json()); // For JSON bodies
app.use(express.urlencoded({ extended: true })); // For form data
```

### Error Handling

The adapter automatically handles errors from your route handlers. You can add Express error middleware for additional handling:

```typescript
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Server error' });
});
```

### Route Paths

Routes are registered relative to the mount point:

```typescript
const router = createRouter({
  routes: [
    { method: 'GET', path: '/hello', handler: () => Response.json({ msg: 'hi' }) }
  ]
});

// Route accessible at: /api/hello
app.use('/api', toExpress(router));
```

## TypeScript

Full TypeScript support with proper types:

```typescript
import type { Router } from '@superfunctions/http';
import type { RequestHandler } from 'express';

const myRouter: Router = createRouter({ routes: [...] });
const handler: RequestHandler = toExpress(myRouter);
```

## Compatibility

- Express 4.x ✅
- Express 5.x ✅

## License

MIT
