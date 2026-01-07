# @superfunctions/http-next

Next.js App Router adapter for [@superfunctions/http](../http) - Use framework-agnostic routers with Next.js 13+ (App Router).

## Installation

```bash
npm install @superfunctions/http @superfunctions/http-next next react react-dom
```

## Quick Start (App Router)

Create `app/api/route.ts`:

```typescript
import { createRouter } from '@superfunctions/http';
import { toNextHandlers } from '@superfunctions/http-next';

const router = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/',
      handler: async () => Response.json({ ok: true }),
    },
    {
      method: 'GET',
      path: '/users/:id',
      handler: async (_req, ctx) => Response.json({ id: ctx.params.id }),
    },
  ],
});

export const { GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD } = toNextHandlers(router);
```

Now requests to `/api`, `/api/users/123`, etc. are handled by your framework-agnostic router.

## Dynamic Routes

Create `app/api/users/[id]/route.ts`:

```typescript
import { createRouter } from '@superfunctions/http';
import { toNextHandlers } from '@superfunctions/http-next';

const router = createRouter({
  routes: [
    {
      method: 'GET',
      path: '/users/:id',
      handler: async (_req, ctx) => Response.json({ id: ctx.params.id }),
    },
  ],
});

export const { GET } = toNextHandlers(router);
```

## API

### `toNextHandlers(router)`

Returns an object with App Router exports: `{ GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD }`.

**Parameters:**
- `router`: Router instance from `@superfunctions/http`

**Returns:** object with Next handler functions

## Notes

- Works in both Node.js and Edge runtimes.
- Body streams are passed through to the router.
- The router sees the original request URL; use `basePath` in your router if mounting below a path (e.g., `/api`).
- Dynamic segment params from the file path are available via `ctx.params` in your handlers.

## Example with Base Path

```typescript
// app/api/route.ts
import { createRouter } from '@superfunctions/http';
import { toNextHandlers } from '@superfunctions/http-next';

const router = createRouter({
  basePath: '/api',
  routes: [
    { method: 'GET', path: '/hello', handler: () => Response.json({ msg: 'hi' }) }
  ],
});

export const { GET } = toNextHandlers(router);
```

## TypeScript

```typescript
import type { Router } from '@superfunctions/http';
import type { NextHandler } from '@superfunctions/http-next';
```

## Compatibility

- Next.js 13.4+ (App Router)

## License

MIT
