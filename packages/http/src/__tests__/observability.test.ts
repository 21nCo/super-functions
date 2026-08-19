import { createObservability } from '@superfunctions/observability';
import { describe, expect, it } from 'vitest';

import { createObservabilityMiddleware } from '../observability.js';
import { createRouter } from '../router.js';

describe('request observability middleware', () => {
  it('finalizes the error response when a request handler throws', async () => {
    const completed: Array<{ status: number; snapshotStatus?: number }> = [];
    const observability = createObservability({ service: 'http-test' });
    const router = createRouter({
      routes: [
        {
          method: 'GET',
          path: '/failure',
          handler: () => {
            observability.record({
              kind: 'db',
              operation: 'find',
              durationMs: 2,
              ok: false,
            });
            throw new Error('handler failed');
          },
        },
      ],
      middleware: [
        createObservabilityMiddleware({
          observability,
          onComplete: ({ response, snapshot }) => {
            completed.push({
              status: response.status,
              snapshotStatus: snapshot.status,
            });
          },
        }),
      ],
      onError: () => Response.json({ error: 'handled' }, { status: 503 }),
    });

    const response = await router.handle(new Request('https://example.test/failure'));

    expect(response.status).toBe(503);
    expect(response.headers.get('server-timing')).toContain('db;dur=2');
    expect(response.headers.get('x-superfunctions-db-call-count')).toBe('1');
    expect(completed).toEqual([{ status: 503, snapshotStatus: 503 }]);
  });
});
