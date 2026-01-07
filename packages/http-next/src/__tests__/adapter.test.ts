import { describe, it, expect } from 'vitest';
import { createRouter } from '@superfunctions/http';
import { toNextHandlers } from '../adapter';

describe('Next.js Adapter', () => {
  it('handles GET requests', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/hello');
    const response = await handlers.GET(request, { params: {} });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ message: 'Hello' });
  });

  it('extracts path parameters', async () => {
    const router = createRouter({
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

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/users/123');
    const response = await handlers.GET(request, { params: {} });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ id: '123' });
  });

  it('handles POST with JSON body', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'POST',
          path: '/users',
          handler: async (req, ctx) => {
            const body = await ctx.json();
            return Response.json({ created: body }, { status: 201 });
          },
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });
    const response = await handlers.POST(request, { params: {} });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toEqual({ created: { name: 'Alice' } });
  });

  it('handles query parameters', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/search',
          handler: async (req, ctx) => {
            return Response.json({ 
              q: ctx.query.get('q'),
              limit: ctx.query.get('limit')
            });
          },
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/search?q=test&limit=10');
    const response = await handlers.GET(request, { params: {} });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ q: 'test', limit: '10' });
  });

  it('returns 404 for unmatched routes', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/notfound');
    const response = await handlers.GET(request, { params: {} });

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
          path: '/test',
          handler: async () => {
            order.push('handler');
            return Response.json({ ok: true });
          },
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/test');
    const response = await handlers.GET(request, { params: {} });

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
          path: '/users/:id',
          handler: async (req, ctx) => {
            const user = await ctx.db.findUser(ctx.params.id);
            return Response.json(user);
          },
        },
      ],
    });

    const handlers = toNextHandlers(router);
    const request = new Request('http://localhost:3000/users/42');
    const response = await handlers.GET(request, { params: {} });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ name: 'User42' });
  });

  it('supports all HTTP methods', async () => {
    const router = createRouter({
      routes: [
        { method: 'GET', path: '/test', handler: () => Response.json({ method: 'GET' }) },
        { method: 'POST', path: '/test', handler: () => Response.json({ method: 'POST' }) },
        { method: 'PUT', path: '/test', handler: () => Response.json({ method: 'PUT' }) },
        { method: 'PATCH', path: '/test', handler: () => Response.json({ method: 'PATCH' }) },
        { method: 'DELETE', path: '/test', handler: () => Response.json({ method: 'DELETE' }) },
        { method: 'OPTIONS', path: '/test', handler: () => Response.json({ method: 'OPTIONS' }) },
      ],
    });

    const handlers = toNextHandlers(router);

    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;
    for (const method of methods) {
      const request = new Request('http://localhost:3000/test', { method });
      const handler = handlers[method];
      const response = await handler(request, { params: {} });
      const data = await response.json();
      expect(data).toEqual({ method });
    }
  });
});
