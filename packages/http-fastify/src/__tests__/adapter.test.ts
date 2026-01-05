import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { createRouter } from '@superfunctions/http';
import { toFastify } from '../adapter.js';

describe('Fastify Adapter', () => {
  it('should handle GET request', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello Fastify' }),
        },
      ],
    });

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/hello',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Hello Fastify' });
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/users/123',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: '123' });
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: { name: 'Alice', email: 'alice@example.com' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      created: { name: 'Alice', email: 'alice@example.com' },
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/search?q=test&page=2',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ q: 'test', page: '2' });
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/goodbye',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toHaveProperty('error');
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    // Without auth header
    const response1 = await fastify.inject({
      method: 'GET',
      url: '/api/protected',
    });
    expect(response1.statusCode).toBe(401);

    // With auth header
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/api/protected',
      headers: {
        Authorization: 'Bearer token',
      },
    });
    expect(response2.statusCode).toBe(200);
    expect(response2.json()).toEqual({ data: 'secret' });
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/me',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: { id: '1', name: 'Alice' } });
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

    const fastify = Fastify();
    await fastify.register(toFastify(router), { prefix: '/api' });

    const getRes = await fastify.inject({ method: 'GET', url: '/api/resource' });
    expect(getRes.json()).toEqual({ method: 'GET' });

    const postRes = await fastify.inject({ method: 'POST', url: '/api/resource' });
    expect(postRes.json()).toEqual({ method: 'POST' });

    const putRes = await fastify.inject({ method: 'PUT', url: '/api/resource' });
    expect(putRes.json()).toEqual({ method: 'PUT' });

    const deleteRes = await fastify.inject({ method: 'DELETE', url: '/api/resource' });
    expect(deleteRes.json()).toEqual({ method: 'DELETE' });
  });
});
