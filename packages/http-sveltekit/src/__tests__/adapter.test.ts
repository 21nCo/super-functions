import { describe, it, expect } from 'vitest';
import { createRouter } from '@superfunctions/http';
import { toSvelteKitHandler, toSvelteKitHandlers } from '../adapter';

// Mock SvelteKit RequestEvent
function createMockEvent(url: string, init?: RequestInit) {
  const request = new Request(url, init);
  return {
    request,
    url: new URL(url),
    params: {},
    locals: {},
  } as any; // Simplified mock
}

describe('SvelteKit Adapter', () => {
  it('handles GET requests', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/api/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/hello');
    const response = await handler(event);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ message: 'Hello' });
  });

  it('extracts path parameters', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/api/users/:id',
          handler: async (req, ctx) => {
            return Response.json({ id: ctx.params.id });
          },
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/users/123');
    const response = await handler(event);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ id: '123' });
  });

  it('handles POST with JSON body', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'POST',
          path: '/api/users',
          handler: async (req, ctx) => {
            const body = await ctx.json();
            return Response.json({ created: body }, { status: 201 });
          },
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    const response = await handler(event);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({ created: { name: 'Alice' } });
  });

  it('handles query parameters', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/api/search',
          handler: async (req, ctx) => {
            return Response.json({
              q: ctx.query.get('q'),
              limit: ctx.query.get('limit'),
            });
          },
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/search?q=test&limit=10');
    const response = await handler(event);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ q: 'test', limit: '10' });
  });

  it('returns 404 for unmatched routes', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/api/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/notfound');
    const response = await handler(event);

    expect(response.status).toBe(404);
  });

  it('executes middleware in order', async () => {
    const order: string[] = [];

    const router = createRouter({
      middleware: [
        async (req, ctx, next) => {
          order.push('first');
          return next();
        },
        async (req, ctx, next) => {
          order.push('second');
          return next();
        },
      ],
      routes: [
        {
          method: 'GET',
          path: '/api/test',
          handler: async () => {
            order.push('handler');
            return Response.json({ ok: true });
          },
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/test');
    const response = await handler(event);

    expect(response.status).toBe(200);
    expect(order).toEqual(['first', 'second', 'handler']);
  });

  it('supports custom context', async () => {
    interface CustomContext {
      db: { findUser: (id: string) => Promise<{ name: string }> };
    }

    const mockDb = {
      findUser: async (id: string) => ({ name: `User${id}` }),
    };

    const router = createRouter<CustomContext>({
      context: { db: mockDb },
      routes: [
        {
          method: 'GET',
          path: '/api/users/:id',
          handler: async (req, ctx) => {
            const user = await ctx.db.findUser(ctx.params.id);
            return Response.json(user);
          },
        },
      ],
    });

    const handler = toSvelteKitHandler(router);
    const event = createMockEvent('http://localhost:5173/api/users/42');
    const response = await handler(event);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ name: 'User42' });
  });

  it('supports all HTTP methods via toSvelteKitHandlers', async () => {
    const router = createRouter({
      routes: [
        { method: 'GET', path: '/api/test', handler: () => Response.json({ method: 'GET' }) },
        { method: 'POST', path: '/api/test', handler: () => Response.json({ method: 'POST' }) },
        { method: 'PUT', path: '/api/test', handler: () => Response.json({ method: 'PUT' }) },
        { method: 'PATCH', path: '/api/test', handler: () => Response.json({ method: 'PATCH' }) },
        { method: 'DELETE', path: '/api/test', handler: () => Response.json({ method: 'DELETE' }) },
        { method: 'OPTIONS', path: '/api/test', handler: () => Response.json({ method: 'OPTIONS' }) },
      ],
    });

    const handlers = toSvelteKitHandlers(router);

    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
    for (const method of methods) {
      const event = createMockEvent('http://localhost:5173/api/test', { method });
      const handler = handlers[method];
      const response = await handler(event);
      const data = await response.json();
      expect(data).toEqual({ method });
    }
  });
});
