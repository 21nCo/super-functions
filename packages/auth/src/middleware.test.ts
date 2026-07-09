import { describe, expect, it } from 'vitest';
import {
  createBearerAuthMiddleware,
  createResourceAuthMiddleware,
  extractBearerTokenFromHeader,
} from './middleware.js';

describe('bearer auth middleware', () => {
  it('extracts bearer token from valid header', () => {
    expect(extractBearerTokenFromHeader('Bearer api-key-123')).toBe('api-key-123');
  });

  it('returns null for malformed bearer header', () => {
    expect(extractBearerTokenFromHeader('Basic abc')).toBeNull();
    expect(extractBearerTokenFromHeader(null)).toBeNull();
  });

  it('rejects missing auth header deterministically', async () => {
    const middleware = createBearerAuthMiddleware({
      validateToken: () => ({ userId: 'u1' }),
    });

    await expect(
      middleware(
        new Request('http://localhost/api'),
        {},
        async () => new Response(null, { status: 200 })
      )
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
      statusCode: 401,
      message: 'Missing or invalid Authorization header',
    });
  });

  it('attaches context for validated bearer token', async () => {
    const context: Record<string, unknown> = {};
    const middleware = createBearerAuthMiddleware({
      validateToken: (token) => ({ token, namespace: 'ns' }),
    });

    const response = await middleware(
      new Request('http://localhost/api', {
        headers: { Authorization: 'Bearer api-key-123' },
      }),
      context,
      async () => new Response(null, { status: 204 })
    );

    expect(response.status).toBe(204);
    expect(context.auth).toEqual({ token: 'api-key-123', namespace: 'ns' });
  });
});

describe('resource auth middleware', () => {
  const provider = {
    validateToken: () => null,
  } as any;

  it('fails closed when no session is present in context', async () => {
    const middleware = createResourceAuthMiddleware(provider);

    await expect(
      middleware(
        new Request('http://localhost/api', {
          headers: { 'x-resource-id': 'r1' },
        }),
        {},
        async () => new Response(null, { status: 200 })
      )
    ).rejects.toMatchObject({
      code: 'AUTHENTICATION_FAILED',
      statusCode: 401,
    });
  });

  it('skips authorization for configured skip paths without a session', async () => {
    const middleware = createResourceAuthMiddleware(provider, { skipPaths: ['/health'] });

    const response = await middleware(
      new Request('http://localhost/health'),
      {},
      async () => new Response(null, { status: 200 })
    );

    expect(response.status).toBe(200);
  });

  it('authorizes when the session grants access to the resource', async () => {
    const context: Record<string, unknown> = { auth: { resourceIds: ['r1'] } };
    const middleware = createResourceAuthMiddleware({ validateToken: () => null } as any);

    const response = await middleware(
      new Request('http://localhost/api', {
        headers: { 'x-resource-id': 'r1' },
      }),
      context,
      async () => new Response(null, { status: 204 })
    );

    expect(response.status).toBe(204);
    expect(context.resourceId).toBe('r1');
  });
});
