import { describe, it, expect } from 'vitest';
import { createRouter } from '../router.js';
import { NotFoundError, UnauthorizedError } from '../errors.js';

describe('createRouter', () => {
  it('should handle GET request', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const req = new Request('http://localhost/hello');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'Hello' });
  });

  it('should extract path params', async () => {
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

    const req = new Request('http://localhost/users/123');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '123' });
  });

  it('should handle multiple path params', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/posts/:postId/comments/:commentId',
          handler: async (req, ctx) => {
            return Response.json({
              postId: ctx.params.postId,
              commentId: ctx.params.commentId,
            });
          },
        },
      ],
    });

    const req = new Request('http://localhost/posts/456/comments/789');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ postId: '456', commentId: '789' });
  });

  it('should return 404 for unmatched routes', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/hello',
          handler: async () => Response.json({ message: 'Hello' }),
        },
      ],
    });

    const req = new Request('http://localhost/goodbye');
    const res = await router.handle(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Route not found');
  });

  it('should execute middleware chain', async () => {
    const calls: string[] = [];

    const mw1 = async (req: Request, ctx: any, next: () => Promise<Response>) => {
      calls.push('mw1-before');
      const res = await next();
      calls.push('mw1-after');
      return res;
    };

    const mw2 = async (req: Request, ctx: any, next: () => Promise<Response>) => {
      calls.push('mw2-before');
      const res = await next();
      calls.push('mw2-after');
      return res;
    };

    const router = createRouter({
      middleware: [mw1, mw2],
      routes: [
        {
          method: 'GET',
          path: '/',
          handler: async () => {
            calls.push('handler');
            return Response.json({});
          },
        },
      ],
    });

    await router.handle(new Request('http://localhost/'));

    expect(calls).toEqual(['mw1-before', 'mw2-before', 'handler', 'mw2-after', 'mw1-after']);
  });

  it('should allow middleware to short-circuit', async () => {
    const authMiddleware = async (req: Request, ctx: any, next: () => Promise<Response>) => {
      const token = req.headers.get('Authorization');
      if (!token) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return next();
    };

    const router = createRouter({
      middleware: [authMiddleware],
      routes: [
        {
          method: 'GET',
          path: '/protected',
          handler: async () => Response.json({ data: 'secret' }),
        },
      ],
    });

    const req = new Request('http://localhost/protected');
    const res = await router.handle(req);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('should handle custom context', async () => {
    interface MyContext {
      user: { id: string; name: string };
    }

    const router = createRouter<MyContext>({
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

    const req = new Request('http://localhost/me');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: '1', name: 'Alice' } });
  });

  it('should handle context factory', async () => {
    const router = createRouter({
      context: async (req) => {
        return { timestamp: Date.now() };
      },
      routes: [
        {
          method: 'GET',
          path: '/time',
          handler: async (req, ctx) => {
            return Response.json({ timestamp: ctx.timestamp });
          },
        },
      ],
    });

    const req = new Request('http://localhost/time');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.timestamp).toBeGreaterThan(0);
  });

  it('should handle custom error handler', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/error',
          handler: async () => {
            throw new Error('Something went wrong');
          },
        },
      ],
      onError: (error, req) => {
        return Response.json({ customError: error.message }, { status: 500 });
      },
    });

    const req = new Request('http://localhost/error');
    const res = await router.handle(req);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ customError: 'Something went wrong' });
  });

  it('should handle RouterError with status code', async () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/unauthorized',
          handler: async () => {
            throw new UnauthorizedError('Invalid token');
          },
        },
      ],
    });

    const req = new Request('http://localhost/unauthorized');
    const res = await router.handle(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Invalid token');
  });

  it('should support base path', async () => {
    const router = createRouter({
      basePath: '/api/v1',
      routes: [
        {
          method: 'GET',
          path: '/users',
          handler: async () => Response.json({ users: [] }),
        },
      ],
    });

    const req = new Request('http://localhost/api/v1/users');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
  });

  it('should parse query parameters', async () => {
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

    const req = new Request('http://localhost/search?q=test&page=2');
    const res = await router.handle(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ q: 'test', page: '2' });
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

    const req = new Request('http://localhost/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }),
    });

    const res = await router.handle(req);

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      created: { name: 'Bob', email: 'bob@example.com' },
    });
  });

  it('should allow dynamic route addition', () => {
    const router = createRouter({
      routes: [],
    });

    router.addRoute({
      method: 'GET',
      path: '/dynamic',
      handler: async () => Response.json({ dynamic: true }),
    });

    expect(router.getRoutes()).toHaveLength(1);
    expect(router.getRoutes()[0].path).toBe('/dynamic');
  });

  it('should allow dynamic middleware addition', () => {
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/',
          handler: async () => Response.json({}),
        },
      ],
    });

    const calls: string[] = [];
    router.use(async (req, ctx, next) => {
      calls.push('dynamic-mw');
      return next();
    });

    // Note: This test just verifies the API works, actual execution would need a request
  });

  it('should handle route-specific middleware', async () => {
    const calls: string[] = [];

    const routeMw = async (req: Request, ctx: any, next: () => Promise<Response>) => {
      calls.push('route-mw');
      return next();
    };

    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/protected',
          middleware: [routeMw],
          handler: async () => {
            calls.push('handler');
            return Response.json({});
          },
        },
      ],
    });

    await router.handle(new Request('http://localhost/protected'));

    expect(calls).toContain('route-mw');
    expect(calls).toContain('handler');
  });

  it('returns 405 with an Allow header when the path exists under another method', async () => {
    const router = createRouter({
      routes: [
        { method: 'GET', path: '/users/:id', handler: async () => Response.json({}) },
        { method: 'DELETE', path: '/users/:id', handler: async () => new Response(null, { status: 204 }) },
      ],
    });

    const res = await router.handle(
      new Request('http://localhost/users/1', { method: 'POST' })
    );

    expect(res.status).toBe(405);
    const allow = res.headers.get('Allow') ?? '';
    expect(allow.split(', ').sort()).toEqual(['DELETE', 'GET']);
  });

  it('still returns 404 for a genuinely unknown path', async () => {
    const router = createRouter({
      routes: [{ method: 'GET', path: '/users', handler: async () => Response.json({}) }],
    });

    const res = await router.handle(
      new Request('http://localhost/nope', { method: 'POST' })
    );
    expect(res.status).toBe(404);
  });

  it('rejects request bodies exceeding maxBodyBytes via Content-Length', async () => {
    const router = createRouter({
      maxBodyBytes: 10,
      routes: [
        {
          method: 'POST',
          path: '/echo',
          handler: async (_req, ctx) => Response.json(await ctx.json()),
        },
      ],
    });

    const res = await router.handle(
      new Request('http://localhost/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ value: 'this is definitely more than ten bytes' }),
      })
    );

    expect(res.status).toBe(413);
  });

  it('accepts request bodies within maxBodyBytes', async () => {
    const router = createRouter({
      maxBodyBytes: 1024,
      routes: [
        {
          method: 'POST',
          path: '/echo',
          handler: async (_req, ctx) => Response.json(await ctx.json()),
        },
      ],
    });

    const res = await router.handle(
      new Request('http://localhost/echo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
