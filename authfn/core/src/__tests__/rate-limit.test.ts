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
        'social-start': { ipLimit: 1, windowSeconds: 60 }
      }
    }
  };
}

async function callRateLimitedRoute(
  config: AuthFnRuntimeConfig,
  path: string
): Promise<Response> {
  const middleware = createAuthFnRateLimitMiddleware(config);
  if (!middleware) {
    throw new Error('Expected rate-limit middleware');
  }
  return middleware(
    new Request(`https://account.example.com${path}`, {
      headers: {
        'cf-connecting-ip': '203.0.113.10'
      }
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
});
