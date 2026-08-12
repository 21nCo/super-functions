import { describe, expect, it } from 'vitest';
import { createBearerAuthMiddleware, extractBearerTokenFromHeader } from './middleware.js';

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
