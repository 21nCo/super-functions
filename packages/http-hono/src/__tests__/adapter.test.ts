import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createRouter } from '@superfunctions/http';
import { toHono } from '../adapter.js';

describe('Hono Adapter', () => {
  it('should handle GET request', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello Hono' }),
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router)); // Mount at root

    const res = await app.request('/hello');
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Hello Hono' });
  });

  it('should extract path parameters', async () => {
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

    const app = new Hono();
    app.route('/', toHono(router));

    const res = await app.request('/users/123');
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '123' });
  });

  it('should handle POST with JSON body', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'POST',
          path: '/users',
          handler: async (req, ctx) => {
            const data = await ctx.json();
            return Response.json({ created: data }, { status: 201 });
          },
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router));

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', email: 'alice@example.com' }),
    });
    
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      created: { name: 'Alice', email: 'alice@example.com' },
    });
  });

  it('should reject requests after Hono middleware consumes the body', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'POST',
          path: '/users',
          handler: async (req, ctx) => {
            const data = await ctx.json();
            return Response.json({ created: data }, { status: 201 });
          },
        },
      ],
    });

    const app = new Hono();
    app.use('*', async (c, next) => {
      await c.req.raw.text();
      await next();
    });
    app.route('/', toHono(router));

    const res = await app.request('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error:
        'Request body was already consumed by Hono middleware before reaching the Superfunctions router',
    });
  });

  it('should handle query parameters', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/search',
          handler: async (req, ctx) => {
            return Response.json({
              q: ctx.query.get('q'),
              page: ctx.query.get('page'),
            });
          },
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router));

    const res = await app.request('/search?q=test&page=2');
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'test', page: '2' });
  });

  it('should handle 404 for unmatched routes', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router));

    const res = await app.request('/goodbye');
    
    // Should return 404 status (Hono returns default 404, not our JSON error)
    expect(res.status).toBe(404);
  });
  it('should execute middleware', async () => {
    const router = createRouter({
      middleware: [
        async (req, ctx, next) => {
          const authHeader = req.headers.get('Authorization');
          if (!authHeader) {
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
    app.route('/', toHono(router));

    // Without auth header
    const res1 = await app.request('/protected');
    expect(res1.status).toBe(401);

    // With auth header
    const res2 = await app.request('/protected', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ data: 'secret' });
  });

  it('should handle custom context', async () => {
    interface AppContext {
      user: { id: string; name: string };
    }

    const router = createRouter<AppContext>({
      context: { user: { id: '1', name: 'Alice' } },
      routes: [
        {
          method: 'GET',
          path: '/me',
          handler: async (req, ctx) => {
            return Response.json({ user: ctx.user });
          },
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router));

    const res = await app.request('/me');
    
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: '1', name: 'Alice' } });
  });

  it('should handle multiple HTTP methods', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/resource',
          handler: async () => Response.json({ method: 'GET' }),
        },
        {
          method: 'POST',
          path: '/resource',
          handler: async () => Response.json({ method: 'POST' }),
        },
        {
          method: 'PUT',
          path: '/resource',
          handler: async () => Response.json({ method: 'PUT' }),
        },
        {
          method: 'DELETE',
          path: '/resource',
          handler: async () => Response.json({ method: 'DELETE' }),
        },
      ],
    });

    const app = new Hono();
    app.route('/', toHono(router));

    const getRes = await app.request('/resource', { method: 'GET' });
    expect(await getRes.json()).toEqual({ method: 'GET' });

    const postRes = await app.request('/resource', { method: 'POST' });
    expect(await postRes.json()).toEqual({ method: 'POST' });

    const putRes = await app.request('/resource', { method: 'PUT' });
    expect(await putRes.json()).toEqual({ method: 'PUT' });

    const deleteRes = await app.request('/resource', { method: 'DELETE' });
    expect(await deleteRes.json()).toEqual({ method: 'DELETE' });
  });

  it('should handle routes mounted at a subpath', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/providers',
          handler: async () => Response.json({ providers: [] }),
        },
      ],
    });

    const app = new Hono();
    app.route('/api/plugfn', toHono(router));

    const res = await app.request('/api/plugfn/providers');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [] });
  });

  it('should strip encoded dynamic mount prefixes without using decoded params', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/providers',
          handler: async () => Response.json({ providers: [] }),
        },
      ],
    });

    const app = new Hono();
    app.route('/:tenant', toHono(router));

    const res = await app.request('/acme%2Fwest/providers');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ providers: [] });
  });
});
