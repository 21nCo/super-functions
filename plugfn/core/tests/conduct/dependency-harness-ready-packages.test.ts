import { describe, expect, it, vi } from 'vitest';

import * as db from '../../../../packages/db/src/index.js';
import * as storageS3 from '../../../../packages/storage-s3/src/index.js';
import * as webhooks from '../../../../packages/webhooks/src/index.js';
import * as queue from '../../../../packages/queue/src/index.js';
import * as http from '../../../../packages/http/src/index.js';
import * as auth from '../../../../packages/auth/src/index.js';
import * as config from '../../../../packages/config/src/index.js';
import * as errors from '../../../../packages/errors/src/index.js';
import * as envelope from '../../../../packages/envelope/src/index.js';
import * as middleware from '../../../../packages/middleware/src/index.js';
import { slackProvider } from '../../../providers/src/slack/index.js';
import type { ActionContext } from '../../src/types/action.js';

describe('conduct ready package dependency harness', () => {
  it('exercises @superfunctions/db and @superfunctions/storage-s3 exports', () => {
    expect(typeof db.createAdapterFactory).toBe('function');
    expect(typeof db.wrapWithRowLevelNamespace).toBe('function');
    expect(typeof storageS3.createS3StorageAdapter).toBe('function');
  });

  it('exercises @superfunctions/webhooks and @superfunctions/queue', async () => {
    const payload = JSON.stringify({ event: 'phase.complete' });
    const signature = webhooks.signWebhookPayload(payload, 'secret', { prefix: 'sha256=' });
    expect(webhooks.verifyWebhookSignature(payload, signature, 'secret', { prefix: 'sha256=' })).toBe(true);

    const adapter = new queue.MemoryQueueAdapter<{ id: string }>();
    await adapter.enqueue('conduct', { id: 'job_1' });
    expect(adapter.size('conduct')).toBe(1);
    expect(await adapter.dequeue('conduct')).toEqual({ id: 'job_1' });
  });

  it('exercises @superfunctions/http and @superfunctions/auth exports', () => {
    expect(typeof http.createRouter).toBe('function');
    expect(typeof auth.createBearerAuthMiddleware).toBe('function');
    expect(typeof auth.createResourceAuthMiddleware).toBe('function');
  });

  it('exercises @superfunctions/config, @superfunctions/errors, @superfunctions/envelope, @superfunctions/middleware', async () => {
    expect(config.readIntEnv('MISSING_KEY', { defaultValue: 5, env: {} })).toBe(5);

    const registry = errors.createErrorRegistry();
    registry.register({
      code: 'X_TEST',
      httpStatus: 400,
      retryable: false,
      defaultMessage: 'x',
    });
    expect(registry.resolve('X_TEST').httpStatus).toBe(400);

    const ok = envelope.ok({ done: true });
    expect(ok.ok).toBe(true);
    const err = envelope.err({
      code: 'E',
      message: 'bad',
      status: 400,
      retryable: false,
    });
    expect(err.ok).toBe(false);

    const limiter = middleware.createRateLimiter({
      windowMs: 60_000,
      maxRequests: 2,
    });
    const first = await limiter.check({ key: 'user-1' });
    expect(first.allowed).toBe(true);
  });

  it('validates slack outbound compatibility without provider changes', async () => {
    const action = slackProvider.actions['chat.postMessage'];
    expect(action).toBeDefined();

    const context: ActionContext = {
      userId: 'user-1',
      provider: {
        name: 'slack',
        baseUrl: 'https://slack.com/api',
      },
      auth: {
        type: 'oauth2',
        credentials: {},
      },
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      http: {
        get: vi.fn(),
        post: vi.fn(async () => ({
          data: {
            ok: true,
            channel: 'C1',
            ts: '1.0',
            message: {
              text: 'hello',
              user: 'U1',
              ts: '1.0',
            },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
        })),
        put: vi.fn(),
        patch: vi.fn(),
        delete: vi.fn(),
      },
    };

    const response = await action.execute(
      {
        channel: 'C1',
        text: 'hello',
      },
      context
    );

    expect(response.ok).toBe(true);
  });
});
