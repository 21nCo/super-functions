import { describe, it, expect } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createRouter } from '@superfunctions/http';
import { toExpress } from '../adapter.js';

describe('Express Adapter', () => {
  describe('toExpress', () => {
    it('should handle GET request', async () => {
      const router = createRouter({
        routes: [
          {
            method: 'GET',
            path: '/hello',
            handler: async () => Response.json({ message: 'Hello Express' }),
          },
        ],
      });

      const app = express();
      app.use('/api', toExpress(router));

      const res = await supertest(app).get('/api/hello').expect(200);

      expect(res.body).toEqual({ message: 'Hello Express' });
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

      const app = express();
      app.use('/api', toExpress(router));

      const res = await supertest(app).get('/api/users/123').expect(200);

      expect(res.body).toEqual({ id: '123' });
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

      const app = express();
      app.use(express.json());
      app.use('/api', toExpress(router));

      const res = await supertest(app)
        .post('/api/users')
        .send({ name: 'Alice', email: 'alice@example.com' })
        .expect(201);

      expect(res.body).toEqual({
        created: { name: 'Alice', email: 'alice@example.com' },
      });
    });

    it('preserves exact bytes parsed by express.raw()', async () => {
      const router = createRouter({
        routes: [
          {
            method: 'POST',
            path: '/webhook',
            handler: async (req) => {
              const body = Buffer.from(await req.arrayBuffer()).toString('utf8');
              return Response.json({ body });
            },
          },
        ],
      });
      const rawBody = '{"event":"created", "spacing":"preserved"}';
      const app = express();
      app.use(express.raw({ type: 'application/json' }));
      app.use('/api', toExpress(router));

      const res = await supertest(app)
        .post('/api/webhook')
        .set('content-type', 'application/json')
        .send(rawBody)
        .expect(200);

      expect(res.body).toEqual({ body: rawBody });
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

      const app = express();
      app.use('/api', toExpress(router));

      const res = await supertest(app)
        .get('/api/search?q=test&page=2')
        .expect(200);

      expect(res.body).toEqual({ q: 'test', page: '2' });
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

      const app = express();
      app.use('/api', toExpress(router));

      const res = await supertest(app).get('/api/goodbye').expect(404);

      expect(res.body.error).toContain('Route not found');
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

      const app = express();
      app.use('/api', toExpress(router));

      // Without auth header
      await supertest(app).get('/api/protected').expect(401);

      // With auth header
      const res = await supertest(app)
        .get('/api/protected')
        .set('Authorization', 'Bearer token')
        .expect(200);

      expect(res.body).toEqual({ data: 'secret' });
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

      const app = express();
      app.use('/api', toExpress(router));

      const res = await supertest(app).get('/api/me').expect(200);

      expect(res.body).toEqual({ user: { id: '1', name: 'Alice' } });
    });

    it('should forward repeated set-cookie headers even without getSetCookie support', async () => {
      const router = {
        handle: async () =>
          ({
            status: 200,
            statusText: 'OK',
            headers: {
              forEach(callback: (value: string, key: string) => void) {
                callback('session=abc; Path=/; HttpOnly', 'set-cookie');
                callback('csrf=def; Path=/; SameSite=Strict', 'set-cookie');
                callback('text/plain; charset=utf-8', 'content-type');
              }
            },
            body: {},
            text: async () => 'ok'
          }) as Response
      };

      const app = express();
      app.use('/api', toExpress(router as any));

      const res = await supertest(app).get('/api').expect(200);

      expect(res.headers['set-cookie']).toEqual([
        'session=abc; Path=/; HttpOnly',
        'csrf=def; Path=/; SameSite=Strict',
      ]);
      expect(res.text).toBe('ok');
    });

    it('should prefer getSetCookie values without duplicating headers from forEach', async () => {
      const router = {
        handle: async () =>
          ({
            status: 200,
            statusText: 'OK',
            headers: {
              getSetCookie() {
                return [
                  'session=abc; Path=/; HttpOnly',
                  'csrf=def; Path=/; SameSite=Strict',
                ];
              },
              forEach(callback: (value: string, key: string) => void) {
                callback('session=abc; Path=/; HttpOnly', 'set-cookie');
                callback('text/plain; charset=utf-8', 'content-type');
              }
            },
            body: {},
            text: async () => 'ok'
          }) as Response
      };

      const app = express();
      app.use('/api', toExpress(router as any));

      const res = await supertest(app).get('/api').expect(200);

      expect(res.headers['set-cookie']).toEqual([
        'session=abc; Path=/; HttpOnly',
        'csrf=def; Path=/; SameSite=Strict',
      ]);
      expect(res.text).toBe('ok');
    });
  });

});
