import { describe, expect, it } from 'vitest';
import { memoryAdapter } from '../../../../packages/db/src/testing/index.js';
import type { AuthFnRuntimeConfig } from '../index.js';
import { createAuthFnRateLimitMiddleware } from '../core/rate-limit.js';

function createConfig(namespace: string): AuthFnRuntimeConfig {
  return {
    database: memoryAdapter({ debug: false }),
    namespace,
    plugins: [],
    rateLimit: {
      enabled: true,
      mode: 'local',
      policies: {
        password: { ipLimit: 1, windowSeconds: 60 },
        'password-reset': { ipLimit: 1, windowSeconds: 60 },
        'social-start': { ipLimit: 1, windowSeconds: 60 }
      }
    }
  };
}

async function callRateLimitedRoute(
  config: AuthFnRuntimeConfig,
  path: string,
  headers: Record<string, string> = { 'cf-connecting-ip': '203.0.113.10' }
): Promise<Response> {
  const middleware = createAuthFnRateLimitMiddleware(config);
  if (!middleware) {
    throw new Error('Expected rate-limit middleware');
  }
  return middleware(
    new Request(`https://account.example.com${path}`, {
      headers
    }),
    {} as never,
    async () => new Response('ok')
  );
}

describe('authfn rate limiting', () => {
  it('keeps counters isolated by route scope', async () => {
    const config = createConfig('rate-limit-scope-test');

    await expect(callRateLimitedRoute(config, '/auth/sign-in/password')).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/social/start')).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/sign-in/password')).rejects.toMatchObject({
      name: 'AuthFnRateLimitedError',
      details: {
        scope: 'password'
      }
    });
    await expect(callRateLimitedRoute(config, '/auth/social/start')).rejects.toMatchObject({
      name: 'AuthFnRateLimitedError',
      details: {
        scope: 'social-start'
      }
    });
  });

  it('applies the password policy to password sign-up', async () => {
    const config = createConfig('rate-limit-sign-up-test');

    await expect(callRateLimitedRoute(config, '/auth/sign-up/password')).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/sign-up/password')).rejects.toMatchObject({
      name: 'AuthFnRateLimitedError',
      details: {
        scope: 'password'
      }
    });
  });

  it('applies the password-reset policy to reset completion', async () => {
    const config = createConfig('rate-limit-reset-complete-test');

    await expect(callRateLimitedRoute(config, '/auth/password/reset/start')).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/password/reset/complete')).rejects.toMatchObject({
      name: 'AuthFnRateLimitedError',
      details: {
        scope: 'password-reset'
      }
    });
  });

  it('does not trust forwarding headers without an explicit resolver', async () => {
    const config = createConfig('rate-limit-untrusted-forwarding-test');

    await expect(callRateLimitedRoute(config, '/auth/social/start', {
      'x-forwarded-for': '203.0.113.1'
    })).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/social/start', {
      'x-forwarded-for': '203.0.113.2'
    })).rejects.toMatchObject({
      name: 'AuthFnRateLimitedError',
      details: { scope: 'social-start', dimension: 'ip' }
    });
  });

  it('uses a configured trusted client-IP resolver', async () => {
    const config = createConfig('rate-limit-trusted-resolver-test');
    config.rateLimit!.resolveClientIp = (request) => request.headers.get('x-test-client-ip') ?? undefined;

    await expect(callRateLimitedRoute(config, '/auth/social/start', {
      'x-test-client-ip': '203.0.113.1'
    })).resolves.toHaveProperty('status', 200);
    await expect(callRateLimitedRoute(config, '/auth/social/start', {
      'x-test-client-ip': '203.0.113.2'
    })).resolves.toHaveProperty('status', 200);
  });
});
